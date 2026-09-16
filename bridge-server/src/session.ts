import { put } from "@vercel/blob";
import { AriClient, isExternalMedia, type AriChannel } from "./ari.js";
import { config } from "./config.js";
import { extractEmail, fetchCallContext, postTranscript } from "./crm.js";
import { DualRecorder, wavToMp3 } from "./recorder.js";
import { connectRealtime, type RealtimeSocket } from "./realtime.js";
import { bindRtp, type RtpSocket } from "./rtp.js";
import { sipToNumber, zadarmaCallback } from "./zadarma.js";

export type LiveCall = {
  callId: string;
  phoneChannelId: string;
  extChannelId?: string;
  bridgeId?: string;
  rtp?: RtpSocket;
  realtime?: RealtimeSocket;
  recorder: DualRecorder;
  lines: string[];
  realtimeSessionId: string | null;
  providerCallSid: string | null;
  finishing: boolean;
};

let nextUdpPort = config.udpPortStart;
const byPhoneChannel = new Map<string, LiveCall>();
const byCallId = new Map<string, LiveCall>();
const pendingByPhone = new Map<string, { callId: string; expires: number }>();
const ringingByChannel = new Map<string, string>();

function rememberPending(phone: string, callId: string) {
  pendingByPhone.set(sipToNumber(phone), { callId, expires: Date.now() + 90_000 });
}

function consumePending(phone: string) {
  const key = sipToNumber(phone);
  const pending = pendingByPhone.get(key);
  if (!pending) return null;
  if (pending.expires < Date.now()) {
    pendingByPhone.delete(key);
    return null;
  }
  pendingByPhone.delete(key);
  return pending.callId;
}

export function findLiveCall(channelId?: string | null) {
  if (!channelId) return null;
  for (const live of byPhoneChannel.values()) {
    if (live.phoneChannelId === channelId || live.extChannelId === channelId) return live;
  }
  return null;
}

export async function startOutboundCall(ari: AriClient, to: string, callId: string) {
  rememberPending(to, callId);
  const endpoint = `PJSIP/${sipToNumber(to)}@zadarma`;
  try {
    const channel = await ari.originate({
      endpoint,
      appArgs: `outbound,${callId}`,
      callerId: config.sipNumber || undefined,
    });
    ringingByChannel.set(channel.id, callId);
    return { ok: true as const, sid: channel.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("ARI originate zlyhal, skúšam Zadarma callback", message);
    try {
      await zadarmaCallback(to);
      return { ok: true as const, sid: `callback_${callId}` };
    } catch (callbackError) {
      const detail = callbackError instanceof Error ? callbackError.message : String(callbackError);
      await postTranscript({
        callId,
        transcript: "",
        status: "FAILED",
        outcome: "failed",
        durationSec: 0,
      }).catch(() => undefined);
      throw new Error(`Originate aj callback zlyhali: ${detail}`);
    }
  }
}

export async function handleStasisStart(ari: AriClient, channel: AriChannel, args: string[]) {
  if (isExternalMedia(channel)) return;
  ringingByChannel.delete(channel.id);
  const direction = args[0] === "inbound" ? "inbound" : "outbound";
  const argCallId = args[1] && args[1] !== "inbound" ? args[1] : undefined;
  const caller = channel.caller?.number || "";
  const called = channel.connected?.number || channel.dialplan?.exten || "";
  const pendingId = consumePending(caller) || consumePending(called) || argCallId;
  await ari.answer(channel.id).catch(() => undefined);

  const ctx = await fetchCallContext({
    callId: pendingId,
    from: caller,
    to: called,
    direction,
    providerCallSid: channel.id,
  });

  const port = nextUdpPort++;
  const rtp = await bindRtp(port);
  const recorder = new DualRecorder();
  const lines: string[] = [];
  const live: LiveCall = {
    callId: ctx.callId,
    phoneChannelId: channel.id,
    rtp,
    recorder,
    lines,
    realtimeSessionId: ctx.sessionId,
    providerCallSid: channel.id,
    finishing: false,
  };
  byPhoneChannel.set(channel.id, live);
  byCallId.set(ctx.callId, live);

  const realtime = await connectRealtime({
    model: ctx.model,
    instructions: ctx.instructions,
    voice: ctx.voice,
    clientSecret: ctx.clientSecret,
    handlers: {
      onAudio: (ulaw) => {
        recorder.pushAgent(ulaw);
        rtp.sendUlaw(ulaw);
      },
      onUserTranscript: (text) => lines.push(`Zákazník: ${text}`),
      onAgentTranscript: (text) => lines.push(`Agent: ${text}`),
      onSessionId: (id) => {
        live.realtimeSessionId = id;
      },
      onError: (message) => console.error("Realtime", live.callId, message),
    },
  });
  live.realtime = realtime;
  rtp.onPayload((payload) => {
    recorder.pushCaller(payload);
    realtime.sendAudio(payload);
  });

  const ext = await ari.createExternalMedia(config.externalHost, port);
  live.extChannelId = ext.id;
  await delay(200);
  const bridge = await ari.createBridge();
  live.bridgeId = bridge.id;
  await ari.addChannel(bridge.id, channel.id);
  await ari.addChannel(bridge.id, ext.id);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleChannelDestroyed(channelId: string, causeTxt?: string) {
  const callId = ringingByChannel.get(channelId);
  if (!callId) return;
  ringingByChannel.delete(channelId);
  const noAnswer = /no.?answer|busy|cancel|congestion|timeout/i.test(causeTxt || "");
  await postTranscript({
    callId,
    transcript: "",
    status: noAnswer ? "NO_ANSWER" : "FAILED",
    outcome: noAnswer ? "no_answer" : "failed",
    durationSec: 0,
    providerCallSid: channelId,
  });
}

export async function finishCall(ari: AriClient, live: LiveCall, status = "COMPLETED") {
  if (live.finishing) return;
  live.finishing = true;
  live.rtp?.close();
  live.realtime?.close();
  if (live.extChannelId) await ari.hangup(live.extChannelId);
  if (live.bridgeId) await ari.destroyBridge(live.bridgeId);
  byPhoneChannel.delete(live.phoneChannelId);
  byCallId.delete(live.callId);

  const transcript = live.lines.join("\n");
  let recordingUrl: string | null = null;
  try {
    const wav = live.recorder.wav();
    const audio = await wavToMp3(wav);
    if (config.blobToken) {
      const blob = await put(`call-recordings/${live.callId}.${audio.ext}`, audio.buffer, {
        access: "public",
        token: config.blobToken,
        contentType: audio.contentType,
      });
      recordingUrl = blob.url;
    }
  } catch (error) {
    console.error("Nahrávka", live.callId, error);
  }

  await postTranscript({
    callId: live.callId,
    transcript,
    capturedEmail: extractEmail(transcript),
    recordingUrl,
    durationSec: live.recorder.durationSec(),
    status,
    providerCallSid: live.providerCallSid,
    realtimeSessionId: live.realtimeSessionId,
    outcome: status === "COMPLETED" ? "connected" : status.toLowerCase(),
  });
}

import { after } from "next/server";
import { prisma } from "./prisma";
import { applyCallDebrief } from "./call-debrief";
import { finalizeCampaignMember } from "./dialer";
import { outcomeFromCallStatus, transcribeCallAudio, twilioCallStatus } from "./transcribe";
import { getRuntimeConfig } from "./settings";
import type { PlaceCallResult } from "./voice";

function first(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

async function findCall(callId: string | null, providerCallSid: string) {
  if (callId) {
    const byId = await prisma.call.findUnique({
      where: { id: callId },
      include: { contact: true },
    });
    if (byId) return byId;
  }
  if (!providerCallSid) return null;
  return prisma.call.findFirst({
    where: { providerCallSid },
    include: { contact: true },
    orderBy: { startedAt: "desc" },
  });
}

export async function ingestTwilioStatus(form: FormData, callId: string | null) {
  const sid = first(form, "CallSid");
  const status = twilioCallStatus(first(form, "CallStatus"));
  const durationSec = Number(first(form, "CallDuration") || 0) || 0;
  const recordingUrlRaw = first(form, "RecordingUrl");
  const recordingSid = first(form, "RecordingSid") || null;
  const call = await findCall(callId, sid);
  if (!call) return { ok: false, reason: "call_not_found" };

  const recordingUrl = recordingUrlRaw
    ? recordingUrlRaw.endsWith(".mp3")
      ? recordingUrlRaw
      : `${recordingUrlRaw}.mp3`
    : call.recordingUrl;

  if (status === "QUEUED" || status === "RINGING" || status === "IN_PROGRESS") {
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status,
        providerCallSid: sid || call.providerCallSid,
        recordingUrl,
        recordingSid: recordingSid || call.recordingSid,
      },
    });
    return { ok: true, status };
  }

  const result: PlaceCallResult = {
    provider: "TWILIO",
    providerCallSid: sid || call.providerCallSid || `twilio_${call.id}`,
    status,
    outcome: outcomeFromCallStatus(status),
    durationSec: durationSec || call.durationSec,
    summary: `Hovor cez Twilio skončil (${status.toLowerCase()}).`,
    transcript: call.transcript || undefined,
    recordingUrl,
    recordingSid,
  };

  await applyCallDebrief({
    callId: call.id,
    contactId: call.contactId,
    contactName: `${call.contact.firstName} ${call.contact.lastName}`.trim(),
    result,
    transcript: call.transcript,
    agentId: call.agentId,
    campaignId: call.campaignId,
    recordingUrl,
    recordingSid,
  });
  await finalizeCampaignMember({
    campaignId: call.campaignId,
    contactId: call.contactId,
    callStatus: status,
  });
  return { ok: true, status };
}

export async function ingestTwilioRecording(form: FormData, callId: string | null) {
  const callSid = first(form, "CallSid");
  const recordingSid = first(form, "RecordingSid");
  const recordingUrlRaw = first(form, "RecordingUrl");
  const durationSec = Number(first(form, "RecordingDuration") || 0) || 0;
  if (!recordingUrlRaw) return { ok: false, reason: "no_recording" };

  const recordingUrl = recordingUrlRaw.endsWith(".mp3") ? recordingUrlRaw : `${recordingUrlRaw}.mp3`;
  const call = await findCall(callId, callSid);
  if (!call) return { ok: false, reason: "call_not_found" };

  await prisma.call.update({
    where: { id: call.id },
    data: {
      recordingUrl,
      recordingSid: recordingSid || call.recordingSid,
      durationSec: durationSec || call.durationSec,
      providerCallSid: callSid || call.providerCallSid,
    },
  });

  after(async () => {
    const config = await getRuntimeConfig();
    const sid = config.twilioAccountSid;
    const token = config.twilioAuthToken;
    let transcript = call.transcript || "";
    if (sid && token) {
      const audio = await fetch(recordingUrl, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        },
      });
      if (audio.ok && config.openaiApiKey) {
        try {
          transcript = await transcribeCallAudio({
            audio: await audio.arrayBuffer(),
            apiKey: config.openaiApiKey,
          });
        } catch {
          transcript = call.transcript || "";
        }
      }
    }

    const status = call.status === "RINGING" || call.status === "QUEUED" || call.status === "IN_PROGRESS"
      ? "COMPLETED"
      : call.status;

    await applyCallDebrief({
      callId: call.id,
      contactId: call.contactId,
      contactName: `${call.contact.firstName} ${call.contact.lastName}`.trim(),
      result: {
        provider: "TWILIO",
        providerCallSid: callSid || call.providerCallSid || `twilio_${call.id}`,
        status,
        outcome: transcript ? "connected" : outcomeFromCallStatus(status),
        durationSec: durationSec || call.durationSec,
        summary: "Nahrávka hovoru je uložená a spracovaná.",
        transcript,
        recordingUrl,
        recordingSid,
      },
      transcript,
      agentId: call.agentId,
      campaignId: call.campaignId,
      recordingUrl,
      recordingSid,
    });
  });

  return { ok: true };
}

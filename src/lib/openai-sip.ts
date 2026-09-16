import type { CallDirection } from "@prisma/client";
import { prisma } from "./prisma";
import { buildCallBriefing } from "./agent-briefing";
import { applyCallDebrief } from "./call-debrief";
import { extractEmailFromTranscript } from "./call-capture";
import { finalizeCampaignMember } from "./dialer";
import { REALTIME_DEFAULT_VOICE, resolveRealtimeModel } from "./openai-agent";
import { getRuntimeConfig } from "./settings";
import { normalizeZadarmaPhone } from "./zadarma";
import type { PlaceCallResult } from "./voice";

type SipHeader = { name?: string; value?: string };

function headerPhone(value?: string | null) {
  const raw = String(value || "");
  const match = raw.match(/(\+?\d{8,16})/);
  return normalizeZadarmaPhone(match?.[1] || raw);
}

export function openaiSipUri() {
  const projectId = process.env.OPENAI_PROJECT_ID?.trim();
  if (!projectId) return null;
  const host = process.env.OPENAI_SIP_HOST?.trim() || "sip-eu.api.openai.com";
  return `sip:${projectId}@${host};transport=tls`;
}

export async function acceptRealtimeSipCall(opts: {
  apiKey: string;
  callId: string;
  instructions: string;
  model?: string | null;
  voice?: string | null;
}) {
  const model = resolveRealtimeModel(opts.model);
  const voice = opts.voice?.trim() || REALTIME_DEFAULT_VOICE;
  const response = await fetch(`https://api.openai.com/v1/realtime/calls/${encodeURIComponent(opts.callId)}/accept`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "realtime",
      model,
      instructions: opts.instructions,
      output_modalities: ["audio"],
      audio: { output: { voice } },
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI SIP accept ${response.status}: ${raw.slice(0, 280)}`);
  }
  return { model, voice };
}

async function matchCall(headers: SipHeader[], openaiCallId: string) {
  const phones = [...new Set(headers.map((item) => headerPhone(item.value)).filter(Boolean))] as string[];
  for (const phone of phones) {
    const contact = await prisma.contact.findUnique({ where: { phone } });
    if (!contact) continue;
    const existing = await prisma.call.findFirst({
      where: {
        contactId: contact.id,
        status: { in: ["QUEUED", "RINGING", "IN_PROGRESS"] },
      },
      include: { contact: true, campaign: true },
      orderBy: { startedAt: "desc" },
    });
    if (existing) return { call: existing, direction: existing.direction as CallDirection, phone };
  }

  const ringing = await prisma.call.findFirst({
    where: {
      provider: "ZADARMA_REALTIME",
      status: { in: ["QUEUED", "RINGING", "IN_PROGRESS"] },
    },
    include: { contact: true, campaign: true },
    orderBy: { startedAt: "desc" },
  });
  if (ringing) return { call: ringing, direction: ringing.direction as CallDirection, phone: ringing.contact.phone };

  const from = headerPhone(headers.find((item) => /from/i.test(item.name || ""))?.value);
  if (!from) return null;
  const contact =
    (await prisma.contact.findUnique({ where: { phone: from } })) ??
    (await prisma.contact.create({
      data: {
        firstName: "Volajúci",
        lastName: from.slice(-4),
        phone: from,
        source: "zadarma-inbound",
        status: "CALLING",
        lastCalledAt: new Date(),
      },
    }));
  const call = await prisma.call.create({
    data: {
      contactId: contact.id,
      direction: "INBOUND",
      status: "IN_PROGRESS",
      provider: "ZADARMA_REALTIME",
      realtimeSessionId: openaiCallId,
    },
    include: { contact: true, campaign: true },
  });
  return { call, direction: "INBOUND" as const, phone: from };
}

export async function handleRealtimeIncomingCall(opts: {
  openaiCallId: string;
  sipHeaders: SipHeader[];
}) {
  const config = await getRuntimeConfig();
  if (!config.openaiApiKey) {
    throw new Error("OpenAI kľúč nie je nastavený");
  }
  const matched = await matchCall(opts.sipHeaders, opts.openaiCallId);
  if (!matched) {
    throw new Error("Hovor sa nenašiel");
  }
  const briefing = matched.call.agentInstructions
    ? { instructions: matched.call.agentInstructions }
    : await buildCallBriefing({ contact: matched.call.contact, campaign: matched.call.campaign });
  const accepted = await acceptRealtimeSipCall({
    apiKey: config.openaiApiKey,
    callId: opts.openaiCallId,
    instructions: briefing.instructions,
    model: config.openaiRealtimeModel,
    voice: config.openaiRealtimeVoice,
  });
  await prisma.call.update({
    where: { id: matched.call.id },
    data: {
      agentInstructions: briefing.instructions,
      realtimeSessionId: opts.openaiCallId,
      provider: "ZADARMA_REALTIME",
      status: "IN_PROGRESS",
    },
  });
  return {
    callId: matched.call.id,
    openaiCallId: opts.openaiCallId,
    apiKey: config.openaiApiKey,
    model: accepted.model,
    voice: accepted.voice,
  };
}

function openRealtimeSocket(url: string, apiKey: string) {
  const Ctor = globalThis.WebSocket as unknown as {
    new (url: string, opts?: { headers?: Record<string, string> }): globalThis.WebSocket;
  };
  return new Ctor(url, { headers: { Authorization: `Bearer ${apiKey}` } });
}

function eventText(payload: Record<string, unknown>) {
  const transcript = payload.transcript;
  if (typeof transcript === "string" && transcript.trim()) return transcript.trim();
  const nested = payload.item as { transcript?: string } | undefined;
  if (typeof nested?.transcript === "string" && nested.transcript.trim()) return nested.transcript.trim();
  return "";
}

export async function monitorRealtimeSipCall(opts: { callId: string; openaiCallId: string; apiKey: string }) {
  const started = Date.now();
  const lines: string[] = [];
  const url = `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(opts.openaiCallId)}`;
  await new Promise<void>((resolve) => {
    const ws = openRealtimeSocket(url, opts.apiKey);
    const done = () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve();
    };
    const timer = setTimeout(done, 4 * 60 * 1000);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "response.create" }));
    });
    ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
        const type = String(payload.type || "");
        const text = eventText(payload);
        if (!text) {
          if (type === "session.ended" || type === "realtime.call.ended") done();
          return;
        }
        if (type.includes("input_audio_transcription") || type.includes("user")) {
          lines.push(`Zákazník: ${text}`);
        } else if (type.includes("output_audio_transcript") || type.includes("audio_transcript")) {
          lines.push(`Agent: ${text}`);
        }
      } catch {
        // ignore malformed frames
      }
    });
    ws.addEventListener("close", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  const call = await prisma.call.findUnique({
    where: { id: opts.callId },
    include: { contact: true },
  });
  if (!call || call.debriefedAt) return;
  const transcript = lines.join("\n");
  const result: PlaceCallResult = {
    provider: "ZADARMA_REALTIME",
    providerCallSid: call.providerCallSid || opts.openaiCallId,
    status: "COMPLETED",
    outcome: "connected",
    durationSec: Math.max(1, Math.round((Date.now() - started) / 1000)),
    summary: "Živý hovor cez ChatGPT Realtime a Zadarma je spracovaný.",
    transcript,
  };
  await applyCallDebrief({
    callId: call.id,
    contactId: call.contactId,
    contactName: `${call.contact.firstName} ${call.contact.lastName}`.trim(),
    result,
    transcript,
    agentId: call.agentId,
    campaignId: call.campaignId,
    realtimeLoaded: true,
    capturedEmail: extractEmailFromTranscript(transcript),
  });
  await finalizeCampaignMember({
    campaignId: call.campaignId,
    contactId: call.contactId,
    callStatus: "COMPLETED",
  });
}

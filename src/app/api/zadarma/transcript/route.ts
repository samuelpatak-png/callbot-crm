import { NextResponse } from "next/server";
import type { CallStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyCallDebrief } from "@/lib/call-debrief";
import { finalizeCampaignMember } from "@/lib/dialer";
import { isBridgeAuthorized } from "@/lib/cron-auth";
import { extractEmailFromTranscript } from "@/lib/call-capture";
import type { BridgeTranscriptPayload } from "@/lib/bridge-protocol";
import type { PlaceCallResult } from "@/lib/voice";

export const maxDuration = 60;

const STATUSES = new Set<CallStatus>([
  "QUEUED",
  "RINGING",
  "IN_PROGRESS",
  "COMPLETED",
  "NO_ANSWER",
  "BUSY",
  "FAILED",
  "VOICEMAIL",
  "CANCELED",
]);

function asCallStatus(value: unknown): CallStatus {
  const raw = String(value || "").toUpperCase() as CallStatus;
  return STATUSES.has(raw) ? raw : "COMPLETED";
}

export async function POST(request: Request) {
  if (!isBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as BridgeTranscriptPayload;
  const callId = String(body.callId || "").trim();
  if (!callId) {
    return NextResponse.json({ error: "callId je povinné" }, { status: 400 });
  }

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true },
  });
  if (!call) {
    return NextResponse.json({ error: "Hovor sa nenašiel" }, { status: 404 });
  }

  let transcript = String(body.transcript || call.transcript || "").trim();
  const capturedEmail =
    typeof body.capturedEmail === "string"
      ? body.capturedEmail.trim().toLowerCase() || null
      : extractEmailFromTranscript(transcript);
  if (capturedEmail && !transcript.includes(capturedEmail)) {
    transcript = `${transcript}\n(E-mail z hovoru: ${capturedEmail})`.trim();
  }

  const status = asCallStatus(body.status);
  const result: PlaceCallResult = {
    provider: "ZADARMA_REALTIME",
    providerCallSid: body.providerCallSid || call.providerCallSid || `zadarma_${call.id}`,
    status,
    outcome: body.outcome || (status === "COMPLETED" ? "connected" : status.toLowerCase()),
    durationSec: Number(body.durationSec || call.durationSec) || 0,
    summary: "Živý hovor cez ChatGPT Realtime a Zadarma je spracovaný.",
    transcript,
    recordingUrl: body.recordingUrl ?? call.recordingUrl,
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
    recordingUrl: body.recordingUrl ?? call.recordingUrl,
    capturedEmail,
  });

  if (body.realtimeSessionId) {
    await prisma.call.update({
      where: { id: call.id },
      data: { realtimeSessionId: body.realtimeSessionId },
    });
  }

  await finalizeCampaignMember({
    campaignId: call.campaignId,
    contactId: call.contactId,
    callStatus: status,
  });

  return NextResponse.json({ ok: true, callId: call.id });
}

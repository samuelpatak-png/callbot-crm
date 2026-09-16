import type { CallStatus, CallDirection } from "@prisma/client";
import { prisma } from "./prisma";
import { applyCallDebrief } from "./call-debrief";
import { finalizeCampaignMember } from "./dialer";
import { normalizeZadarmaPhone, zadarmaRecordingUrl } from "./zadarma";
import type { PlaceCallResult } from "./voice";

function asStatus(disposition: string, event: string): CallStatus {
  const value = disposition.trim().toLowerCase();
  if (event === "NOTIFY_ANSWER") return "IN_PROGRESS";
  if (event === "NOTIFY_START" || event === "NOTIFY_OUT_START" || event === "NOTIFY_INTERNAL") {
    return "RINGING";
  }
  if (value === "answered") return "COMPLETED";
  if (value === "busy") return "BUSY";
  if (value === "no answer") return "NO_ANSWER";
  if (value === "cancel") return "CANCELED";
  if (
    value === "failed" ||
    value.includes("no money") ||
    value.includes("unallocated") ||
    value.includes("limit")
  ) {
    return "FAILED";
  }
  return "COMPLETED";
}

function outcomeFrom(status: CallStatus, disposition: string) {
  if (status === "NO_ANSWER") return "no_answer";
  if (status === "BUSY") return "busy";
  if (status === "VOICEMAIL") return "voicemail";
  if (status === "FAILED" || status === "CANCELED") return "failed";
  if (disposition.toLowerCase() === "answered") return "connected";
  return disposition || "connected";
}

function phoneFromEvent(body: Record<string, string>, event: string) {
  if (event === "NOTIFY_OUT_START" || event === "NOTIFY_OUT_END") {
    return normalizeZadarmaPhone(body.destination);
  }
  return normalizeZadarmaPhone(body.caller_id) || normalizeZadarmaPhone(body.destination);
}

export async function ingestZadarmaEvent(body: Record<string, string>) {
  const event = String(body.event || "").toUpperCase();
  if (!event.startsWith("NOTIFY_")) {
    return { ok: true, ignored: true, event };
  }

  const pbxCallId = body.pbx_call_id || "";
  const durationSec = Number(body.duration || 0) || 0;
  const disposition = body.disposition || "";
  const status = asStatus(disposition, event);
  const phone = phoneFromEvent(body, event);
  const direction: CallDirection =
    event === "NOTIFY_OUT_START" || event === "NOTIFY_OUT_END" ? "OUTBOUND" : "INBOUND";

  let call = pbxCallId
    ? await prisma.call.findFirst({
        where: { providerCallSid: pbxCallId },
        include: { contact: true },
        orderBy: { startedAt: "desc" },
      })
    : null;

  if (!call && phone) {
    const contact = await prisma.contact.findUnique({ where: { phone } });
    if (contact) {
      call = await prisma.call.findFirst({
        where: {
          contactId: contact.id,
          status: { in: ["QUEUED", "RINGING", "IN_PROGRESS"] },
        },
        include: { contact: true },
        orderBy: { startedAt: "desc" },
      });
    }
  }

  if (!call) {
    return { ok: true, reason: "call_not_found", event, pbxCallId };
  }

  if (event === "NOTIFY_START" || event === "NOTIFY_OUT_START" || event === "NOTIFY_ANSWER" || event === "NOTIFY_INTERNAL") {
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status,
        provider: "ZADARMA_REALTIME",
        providerCallSid: pbxCallId || call.providerCallSid,
        direction: call.direction || direction,
      },
    });
    return { ok: true, status, event };
  }

  if (event === "NOTIFY_RECORD") {
    const apiKey = process.env.ZADARMA_API_KEY?.trim();
    const apiSecret = process.env.ZADARMA_API_SECRET?.trim();
    if (apiKey && apiSecret) {
      const recordingUrl = await zadarmaRecordingUrl({
        apiKey,
        apiSecret,
        callId: body.call_id_with_rec,
        pbxCallId: pbxCallId,
      });
      if (recordingUrl) {
        await prisma.call.update({
          where: { id: call.id },
          data: {
            recordingUrl,
            recordingSid: body.call_id_with_rec || call.recordingSid,
            provider: "ZADARMA_REALTIME",
            providerCallSid: pbxCallId || call.providerCallSid,
          },
        });
      }
    }
    return { ok: true, event };
  }

  const terminal = ["NOTIFY_END", "NOTIFY_OUT_END"].includes(event);
  if (!terminal) {
    return { ok: true, ignored: true, event };
  }

  const answered = disposition.toLowerCase() === "answered" || status === "COMPLETED";
  await prisma.call.update({
    where: { id: call.id },
    data: {
      durationSec: durationSec || call.durationSec,
      providerCallSid: pbxCallId || call.providerCallSid,
      provider: "ZADARMA_REALTIME",
      status: answered && !call.debriefedAt ? "IN_PROGRESS" : status,
      endedAt: answered && !call.debriefedAt ? call.endedAt : new Date(),
    },
  });

  if (answered && !call.debriefedAt) {
    return { ok: true, status: "IN_PROGRESS", waiting: "transcript", event };
  }

  const result: PlaceCallResult = {
    provider: "ZADARMA_REALTIME",
    providerCallSid: pbxCallId || call.providerCallSid || `zadarma_${call.id}`,
    status,
    outcome: outcomeFrom(status, disposition),
    durationSec: durationSec || call.durationSec,
    summary: `Hovor cez Zadarma skončil (${disposition || status.toLowerCase()}).`,
    transcript: call.transcript || undefined,
    recordingUrl: call.recordingUrl,
    recordingSid: call.recordingSid,
  };

  await applyCallDebrief({
    callId: call.id,
    contactId: call.contactId,
    contactName: `${call.contact.firstName} ${call.contact.lastName}`.trim(),
    result,
    transcript: call.transcript,
    agentId: call.agentId,
    campaignId: call.campaignId,
    recordingUrl: call.recordingUrl,
    recordingSid: call.recordingSid,
  });
  await finalizeCampaignMember({
    campaignId: call.campaignId,
    contactId: call.contactId,
    callStatus: status,
  });
  return { ok: true, status, event };
}

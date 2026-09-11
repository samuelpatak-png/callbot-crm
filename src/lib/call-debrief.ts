import type { ContactStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { PlaceCallResult } from "./voice";

export type CallDebrief = {
  summary: string;
  outcome: string;
  contactStatus: ContactStatus;
  doNotCall: boolean;
  followUpAt: Date | null;
  note: string;
  taskTitle: string | null;
  taskDueAt: Date | null;
  objections: string[];
  source: "openai" | "heuristic";
};

const STATUSES = new Set<ContactStatus>([
  "NO_ANSWER",
  "VOICEMAIL",
  "CONNECTED",
  "CALLBACK",
  "INTERESTED",
  "NOT_INTERESTED",
  "DNC",
  "FAILED",
]);

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function heuristicDebrief(result: PlaceCallResult, contactName: string): CallDebrief {
  const name = contactName.trim() || "kontakt";
  const base = {
    doNotCall: false,
    followUpAt: null as Date | null,
    taskTitle: null as string | null,
    taskDueAt: null as Date | null,
    objections: [] as string[],
    source: "heuristic" as const,
    outcome: result.outcome,
  };

  if (result.outcome === "interested") {
    return {
      ...base,
      summary: `${name} prejavil záujem. Treba poslať ponuku alebo dohodnúť termín.`,
      contactStatus: "INTERESTED",
      followUpAt: hoursFromNow(24),
      note: `Po hovore: záujem. ${result.summary}`,
      taskTitle: `Dohodnúť termín / poslať ponuku — ${name}`,
      taskDueAt: hoursFromNow(24),
    };
  }
  if (result.status === "NO_ANSWER" || result.outcome === "no_answer") {
    return {
      ...base,
      summary: `${name} nezdvihol. Naplánovať ďalší pokus.`,
      contactStatus: "NO_ANSWER",
      followUpAt: hoursFromNow(24),
      note: `Po hovore: nezdvihol. ${result.summary}`,
      taskTitle: `Zavolať znova — ${name}`,
      taskDueAt: hoursFromNow(24),
    };
  }
  if (result.status === "VOICEMAIL" || result.outcome === "voicemail") {
    return {
      ...base,
      summary: `${name} mal záznamník. Ozvať sa neskôr.`,
      contactStatus: "VOICEMAIL",
      followUpAt: hoursFromNow(24),
      note: `Po hovore: záznamník. ${result.summary}`,
      taskTitle: `Zavolať znova po odkaze — ${name}`,
      taskDueAt: hoursFromNow(24),
    };
  }
  if (result.status === "BUSY" || result.outcome === "busy") {
    return {
      ...base,
      summary: `${name} mal obsadené. Spätné volanie.`,
      contactStatus: "CALLBACK",
      followUpAt: hoursFromNow(4),
      note: `Po hovore: obsadené. ${result.summary}`,
      taskTitle: `Spätné volanie — ${name}`,
      taskDueAt: hoursFromNow(4),
    };
  }
  if (result.status === "FAILED" || result.outcome === "failed" || result.outcome === "twilio_error") {
    return {
      ...base,
      summary: `Hovor na ${name} zlyhal.`,
      contactStatus: "FAILED",
      note: `Po hovore: zlyhalo. ${result.summary}`,
    };
  }
  if (result.outcome === "not_interested" || result.outcome === "dnc") {
    const dnc = result.outcome === "dnc";
    return {
      ...base,
      summary: dnc
        ? `${name} požiadal, aby sme už nevolali.`
        : `${name} nemá teraz záujem.`,
      contactStatus: dnc ? "DNC" : "NOT_INTERESTED",
      doNotCall: dnc,
      note: dnc ? `Po hovore: nevolať. ${result.summary}` : `Po hovore: bez záujmu. ${result.summary}`,
    };
  }
  return {
    ...base,
    summary: `Hovor s ${name} prebehol. ${result.summary}`,
    contactStatus: "CONNECTED",
    note: `Po hovore: spojený. ${result.summary}`,
  };
}

function parseIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asStatus(value: unknown, fallback: ContactStatus): ContactStatus {
  const raw = String(value || "").toUpperCase();
  if (STATUSES.has(raw as ContactStatus)) return raw as ContactStatus;
  return fallback;
}

export async function analyzeCallTranscript(opts: {
  transcript: string;
  result: PlaceCallResult;
  contactName: string;
  apiKey: string | null;
}): Promise<CallDebrief> {
  const fallback = heuristicDebrief(opts.result, opts.contactName);
  if (!opts.apiKey || opts.result.status === "RINGING") return fallback;
  if (!opts.transcript.trim() || opts.transcript.startsWith("[stub] Dial")) return fallback;

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Si operátor CRM. Z prepisu odchádzajúceho hovoru vráť JSON:
{
  "summary": "2-4 vety po slovensky, len fakty z prepisu",
  "outcome": "interested|callback|not_interested|voicemail|no_answer|dnc|connected|busy|failed",
  "contactStatus": "INTERESTED|CALLBACK|NOT_INTERESTED|VOICEMAIL|NO_ANSWER|DNC|CONNECTED|FAILED",
  "doNotCall": false,
  "followUpAt": "ISO-8601 alebo null",
  "note": "poznámka do karty kontaktu po slovensky",
  "taskTitle": "názov úlohy alebo null",
  "taskDueAt": "ISO-8601 alebo null",
  "objections": ["krátke námietky z hovoru"]
}
Nevymýšľaj ceny ani sľuby, ktoré v prepise nie sú. Ak povedal nevolajte, doNotCall=true a contactStatus=DNC.`,
          },
          {
            role: "user",
            content: `Kontakt: ${opts.contactName}\nTechnický výsledok: ${opts.result.outcome} / ${opts.result.status}\n\nPrepis:\n${opts.transcript.slice(0, 8000)}`,
          },
        ],
      }),
    });
  } catch {
    return fallback;
  }

  if (!response.ok) return fallback;
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  try {
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}") as Record<string, unknown>;
    const outcome = String(parsed.outcome || fallback.outcome);
    const contactStatus = asStatus(parsed.contactStatus, fallback.contactStatus);
    const doNotCall = Boolean(parsed.doNotCall) || contactStatus === "DNC";
    const followUpAt = parseIsoDate(parsed.followUpAt) ?? (contactStatus === "CALLBACK" || contactStatus === "NO_ANSWER" ? hoursFromNow(24) : fallback.followUpAt);
    const taskTitle = typeof parsed.taskTitle === "string" && parsed.taskTitle.trim() ? parsed.taskTitle.trim().slice(0, 180) : fallback.taskTitle;
    return {
      summary: String(parsed.summary || fallback.summary).slice(0, 600),
      outcome,
      contactStatus: doNotCall ? "DNC" : contactStatus,
      doNotCall,
      followUpAt,
      note: String(parsed.note || fallback.note).slice(0, 2000),
      taskTitle,
      taskDueAt: parseIsoDate(parsed.taskDueAt) ?? (taskTitle ? followUpAt ?? hoursFromNow(24) : null),
      objections: Array.isArray(parsed.objections)
        ? parsed.objections.map((item) => String(item).slice(0, 120)).filter(Boolean).slice(0, 8)
        : [],
      source: "openai",
    };
  } catch {
    return fallback;
  }
}

export async function applyCallDebrief(opts: {
  callId: string;
  contactId: string;
  contactName: string;
  result: PlaceCallResult;
  transcript?: string | null;
  agentId?: string | null;
  campaignId?: string | null;
  realtimeLoaded?: boolean;
}) {
  if (opts.result.status === "RINGING") {
    await prisma.call.update({
      where: { id: opts.callId },
      data: {
        status: opts.result.status,
        outcome: opts.result.outcome,
        durationSec: opts.result.durationSec,
        provider: opts.result.provider,
        providerCallSid: opts.result.providerCallSid,
        transcript: opts.transcript ?? opts.result.transcript,
        summary: opts.result.summary,
      },
    });
    return null;
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const debrief = await analyzeCallTranscript({
    transcript: opts.transcript || opts.result.transcript || "",
    result: opts.result,
    contactName: opts.contactName,
    apiKey: settings?.openaiApiKey ?? null,
  });

  const summary = opts.realtimeLoaded
    ? `${debrief.summary} ChatGPT Realtime mal načítaný skript.`
    : debrief.summary;

  await prisma.$transaction(async (tx) => {
    await tx.call.update({
      where: { id: opts.callId },
      data: {
        status: opts.result.status,
        outcome: debrief.outcome,
        durationSec: opts.result.durationSec,
        endedAt: new Date(),
        provider: opts.result.provider,
        providerCallSid: opts.result.providerCallSid,
        transcript: opts.transcript ?? opts.result.transcript,
        summary,
        debrief: {
          source: debrief.source,
          objections: debrief.objections,
          contactStatus: debrief.contactStatus,
          taskTitle: debrief.taskTitle,
        } satisfies Prisma.InputJsonValue,
      },
    });

    await tx.contact.update({
      where: { id: opts.contactId },
      data: {
        status: debrief.contactStatus,
        doNotCall: debrief.doNotCall ? true : undefined,
        lastCalledAt: new Date(),
        nextFollowUpAt: debrief.followUpAt,
      },
    });

    await tx.note.create({
      data: {
        contactId: opts.contactId,
        authorId: opts.agentId ?? undefined,
        body: debrief.note,
      },
    });

    if (debrief.taskTitle) {
      await tx.task.create({
        data: {
          title: debrief.taskTitle,
          description: debrief.summary,
          dueAt: debrief.taskDueAt,
          contactId: opts.contactId,
          ownerId: opts.agentId ?? undefined,
        },
      });
    }

    await tx.activity.create({
      data: {
        type: "CALL",
        contactId: opts.contactId,
        userId: opts.agentId ?? undefined,
        message: `Hovor: ${debrief.outcome} · ${debrief.source === "openai" ? "prepis z ChatGPT" : "automatický zápis"}`,
        payload: {
          callId: opts.callId,
          campaignId: opts.campaignId,
          sid: opts.result.providerCallSid,
          objections: debrief.objections,
        },
      },
    });
  });

  return debrief;
}

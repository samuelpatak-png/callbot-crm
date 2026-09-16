import type { CallResultKind, ContactStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { PlaceCallResult } from "./voice";
import { classifyCallResult, extractEmailFromTranscript, normalizeEmail } from "./call-capture";
import { getRuntimeConfig } from "./settings";

export type CallDebrief = {
  summary: string;
  outcome: string;
  contactStatus: ContactStatus;
  resultKind: CallResultKind;
  capturedEmail: string | null;
  capturedCompany: string | null;
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
  "CONVERTED",
  "DNC",
  "FAILED",
]);

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function heuristicDebrief(result: PlaceCallResult, contactName: string, transcript = ""): CallDebrief {
  const name = contactName.trim() || "kontakt";
  const capturedEmail = extractEmailFromTranscript(transcript || result.transcript || "");
  const base = {
    doNotCall: false,
    followUpAt: null as Date | null,
    taskTitle: null as string | null,
    taskDueAt: null as Date | null,
    objections: [] as string[],
    source: "heuristic" as const,
    outcome: result.outcome,
    capturedEmail,
    capturedCompany: null as string | null,
    resultKind: "FAILURE" as CallResultKind,
  };

  if (result.outcome === "interested") {
    return {
      ...base,
      summary: capturedEmail
        ? `${name} prejavil záujem a dal e-mail ${capturedEmail}.`
        : `${name} prejavil záujem. Treba dohodnúť termín.`,
      contactStatus: "INTERESTED",
      resultKind: "SUCCESS",
      followUpAt: hoursFromNow(24),
      note: capturedEmail
        ? `Po hovore: záujem. E-mail z hovoru: ${capturedEmail}. ${result.summary}`
        : `Po hovore: záujem. ${result.summary}`,
      taskTitle: capturedEmail
        ? `Ozvať sa na ${capturedEmail} — ${name}`
        : `Dohodnúť termín — ${name}`,
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
      summary: `${name} mal obsadené. Naplánovať ďalší pokus.`,
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

  const connected: CallDebrief = {
    ...base,
    summary: capturedEmail
      ? `Hovor s ${name} prebehol. E-mail z hovoru: ${capturedEmail}.`
      : `Hovor s ${name} prebehol. Treba dohodnúť ďalší krok.`,
    contactStatus: capturedEmail || result.outcome === "callback" ? "CALLBACK" : "CONNECTED",
    resultKind: "SUCCESS",
    followUpAt: hoursFromNow(24),
    note: capturedEmail
      ? `Po hovore: spojený, e-mail ${capturedEmail}. ${result.summary}`
      : `Po hovore: spojený. ${result.summary}`,
    taskTitle: capturedEmail ? `Ozvať sa na ${capturedEmail} — ${name}` : `Dohodnúť ďalší krok — ${name}`,
    taskDueAt: hoursFromNow(24),
  };
  return connected;
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
  const fallback = heuristicDebrief(opts.result, opts.contactName, opts.transcript);
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
  "resultKind": "SUCCESS|FAILURE",
  "capturedEmail": "e-mail z hovoru alebo null",
  "capturedCompany": "firma z hovoru alebo null",
  "doNotCall": false,
  "followUpAt": "ISO-8601 alebo null",
  "note": "poznámka do karty kontaktu po slovensky",
  "taskTitle": "názov úlohy alebo null",
  "taskDueAt": "ISO-8601 alebo null",
  "objections": ["krátke námietky z hovoru"]
}
SUCCESS = záujem, termín, spätné volanie, e-mail z hovoru, deal sa posunul.
FAILURE = nezdvihol, záznamník, bez záujmu, DNC, zlyhanie, hovor bez ďalšieho kroku.
Nevymýšľaj e-mail, ceny ani sľuby, ktoré v prepise nie sú. E-mail z hovoru len zapíš, nič neodosielaj. Ak povedal nevolajte, doNotCall=true a contactStatus=DNC.`,
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
    const capturedEmail =
      normalizeEmail(typeof parsed.capturedEmail === "string" ? parsed.capturedEmail : null) ??
      fallback.capturedEmail;
    const followUpAt =
      parseIsoDate(parsed.followUpAt) ??
      (contactStatus === "CALLBACK" || contactStatus === "NO_ANSWER" || capturedEmail
        ? hoursFromNow(24)
        : fallback.followUpAt);
    const taskTitle =
      typeof parsed.taskTitle === "string" && parsed.taskTitle.trim()
        ? parsed.taskTitle.trim().slice(0, 180)
        : capturedEmail && !fallback.taskTitle
          ? `Ozvať sa na ${capturedEmail}`
          : fallback.taskTitle;
    const resultKindRaw = String(parsed.resultKind || "").toUpperCase();
    const resultKind: CallResultKind =
      resultKindRaw === "SUCCESS" || resultKindRaw === "FAILURE"
        ? resultKindRaw
        : classifyCallResult({ outcome, contactStatus, capturedEmail });
    return {
      summary: String(parsed.summary || fallback.summary).slice(0, 600),
      outcome,
      contactStatus: doNotCall ? "DNC" : contactStatus,
      resultKind: doNotCall ? "FAILURE" : resultKind,
      capturedEmail,
      capturedCompany:
        typeof parsed.capturedCompany === "string" && parsed.capturedCompany.trim()
          ? parsed.capturedCompany.trim().slice(0, 120)
          : fallback.capturedCompany,
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
  recordingUrl?: string | null;
  recordingSid?: string | null;
  capturedEmail?: string | null;
}) {
  const existing = await prisma.call.findUnique({ where: { id: opts.callId } });
  const recordingUrl = opts.recordingUrl ?? opts.result.recordingUrl ?? existing?.recordingUrl ?? null;
  const recordingSid = opts.recordingSid ?? opts.result.recordingSid ?? existing?.recordingSid ?? null;

  if (existing?.resultOverridden) {
    await prisma.call.update({
      where: { id: opts.callId },
      data: {
        durationSec: opts.result.durationSec || existing.durationSec,
        recordingUrl,
        recordingSid,
        transcript: opts.transcript || opts.result.transcript || existing.transcript,
        providerCallSid: opts.result.providerCallSid || existing.providerCallSid,
        status: opts.result.status === "RINGING" ? existing.status : opts.result.status,
      },
    });
    return null;
  }

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
        recordingUrl,
        recordingSid,
        resultKind: "PENDING",
      },
    });
    return null;
  }

  const transcript = opts.transcript || opts.result.transcript || existing?.transcript || "";
  const config = await getRuntimeConfig();
  const debrief = await analyzeCallTranscript({
    transcript,
    result: opts.result,
    contactName: opts.contactName,
    apiKey: config.openaiApiKey,
  });
  if (opts.capturedEmail) {
    debrief.capturedEmail = opts.capturedEmail;
  }

  const summary = opts.realtimeLoaded
    ? `${debrief.summary} ChatGPT Realtime mal načítaný skript.`
    : debrief.summary;
  const already = Boolean(existing?.debriefedAt);
  const emailIsNew = Boolean(
    debrief.capturedEmail && debrief.capturedEmail !== existing?.capturedEmail,
  );

  await prisma.$transaction(async (tx) => {
    await tx.call.update({
      where: { id: opts.callId },
      data: {
        status: opts.result.status,
        outcome: debrief.outcome,
        durationSec: opts.result.durationSec || existing?.durationSec || 0,
        endedAt: existing?.endedAt ?? new Date(),
        provider: opts.result.provider,
        providerCallSid: opts.result.providerCallSid || existing?.providerCallSid,
        transcript,
        summary,
        recordingUrl,
        recordingSid,
        resultKind: debrief.resultKind,
        capturedEmail: debrief.capturedEmail,
        debriefedAt: new Date(),
        debrief: {
          source: debrief.source,
          objections: debrief.objections,
          contactStatus: debrief.contactStatus,
          resultKind: debrief.resultKind,
          capturedEmail: debrief.capturedEmail,
          capturedCompany: debrief.capturedCompany,
          taskTitle: debrief.taskTitle,
        } satisfies Prisma.InputJsonValue,
      },
    });

    await tx.contact.update({
      where: { id: opts.contactId },
      data: {
        status: debrief.contactStatus,
        email: debrief.capturedEmail ?? undefined,
        doNotCall: debrief.doNotCall ? true : undefined,
        lastCalledAt: new Date(),
        nextFollowUpAt: debrief.followUpAt ?? undefined,
      },
    });

    if (!already) {
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
          message: `${debrief.resultKind === "SUCCESS" ? "Úspešný" : "Neúspešný"} hovor: ${debrief.outcome}${
            debrief.capturedEmail ? ` · ${debrief.capturedEmail}` : ""
          }`,
          payload: {
            callId: opts.callId,
            campaignId: opts.campaignId,
            sid: opts.result.providerCallSid,
            resultKind: debrief.resultKind,
            capturedEmail: debrief.capturedEmail,
            objections: debrief.objections,
          },
        },
      });
    } else if (emailIsNew && debrief.capturedEmail) {
      await tx.note.create({
        data: {
          contactId: opts.contactId,
          body: `E-mail z nahrávky hovoru: ${debrief.capturedEmail}`,
        },
      });
    }

    if (debrief.resultKind === "SUCCESS") {
      const openDeal = await tx.deal.findFirst({
        where: { contactId: opts.contactId, stage: { not: "LOST" } },
        select: { id: true },
      });
      if (!openDeal) {
        await tx.deal.create({
          data: {
            title: debrief.capturedEmail
              ? `Ponuka pre ${opts.contactName}`
              : `Hovor: ${opts.contactName}`,
            stage: debrief.contactStatus === "INTERESTED" ? "QUALIFIED" : "LEAD",
            contactId: opts.contactId,
          },
        });
      }
    }
  });

  return debrief;
}

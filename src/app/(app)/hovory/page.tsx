import { prisma } from "@/lib/prisma";
import { callOutcomeLabel, callStatusLabel, formatDateTime } from "@/lib/utils";
import Link from "next/link";

function debriefMeta(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const data = value as { source?: string; objections?: unknown };
  const objections = Array.isArray(data.objections)
    ? data.objections.map((item) => String(item)).filter(Boolean)
    : [];
  return {
    source: data.source === "openai" ? "ChatGPT" : "automaticky",
    objections,
  };
}

export default async function CallsPage() {
  const calls = await prisma.call.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
    include: { contact: true, campaign: true },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hovory</h1>
        <p className="text-sm text-slate-500">
          Po každom hovore CRM zapíše zhrnutie, prepis, stav kontaktu, poznámku a prípadnú úlohu.
        </p>
      </div>
      <div className="space-y-3">
        {calls.length === 0 ? (
          <p className="rounded-2xl border border-border bg-white p-5 text-sm text-slate-500">
            Zatiaľ žiadne hovory. Z karty kontaktu stlačte Volat teraz.
          </p>
        ) : null}
        {calls.map((call) => {
          const meta = debriefMeta(call.debrief);
          return (
            <article key={call.id} className="rounded-2xl border border-border bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/kontakty/${call.contactId}`} className="font-semibold hover:text-primary">
                    {call.contact.firstName} {call.contact.lastName}
                  </Link>
                  <p className="number-mono text-xs text-slate-500">{call.contact.phone}</p>
                  {call.campaign ? <p className="text-xs text-slate-500">{call.campaign.name}</p> : null}
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium">{callOutcomeLabel(call.outcome)}</p>
                  <p className="text-xs text-slate-500">
                    {callStatusLabel[call.status]} · {call.durationSec}s · {call.provider}
                    {meta ? ` · ${meta.source}` : ""}
                  </p>
                  <p className="number-mono text-xs text-slate-500">{formatDateTime(call.startedAt)}</p>
                </div>
              </div>
              {call.summary ? <p className="mt-3 text-sm text-slate-700">{call.summary}</p> : null}
              {meta?.objections.length ? (
                <p className="mt-2 text-xs text-slate-500">Námietky: {meta.objections.join(" · ")}</p>
              ) : null}
              {call.transcript ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-primary">Prepis hovoru</summary>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-5 text-slate-700">
                    {call.transcript}
                  </pre>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

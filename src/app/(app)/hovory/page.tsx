import { CallResultKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  callOutcomeLabel,
  callResultKindLabel,
  callResultKindTone,
  callStatusLabel,
  formatDateTime,
} from "@/lib/utils";
import { RecordingPlayer } from "@/components/recording-player";
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

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ vysledok?: string }>;
}) {
  const params = await searchParams;
  const filter =
    params.vysledok === "uspech" ? "SUCCESS" : params.vysledok === "neuspech" ? "FAILURE" : null;

  const [calls, successCount, failureCount] = await Promise.all([
    prisma.call.findMany({
      where: filter ? { resultKind: filter as CallResultKind } : {},
      orderBy: { startedAt: "desc" },
      take: 100,
      include: { contact: true, campaign: true },
    }),
    prisma.call.count({ where: { resultKind: "SUCCESS" } }),
    prisma.call.count({ where: { resultKind: "FAILURE" } }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hovory</h1>
        <p className="text-sm text-slate-500">
          Každý hovor sa nahráva. CRM samo zapíše prepis, e-mail z hovoru a zaradí ho ako úspešný alebo
          neúspešný.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterLink href="/hovory" active={!filter} label={`Všetky (${successCount + failureCount})`} />
        <FilterLink href="/hovory?vysledok=uspech" active={filter === "SUCCESS"} label={`Úspešné (${successCount})`} />
        <FilterLink
          href="/hovory?vysledok=neuspech"
          active={filter === "FAILURE"}
          label={`Neúspešné (${failureCount})`}
        />
      </div>

      <div className="space-y-3">
        {calls.length === 0 ? (
          <p className="rounded-2xl border border-border bg-white p-5 text-sm text-slate-500">
            Zatiaľ žiadne hovory v tomto filtri. Z karty kontaktu stlačte Volat teraz.
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
                  {call.capturedEmail ? (
                    <p className="mt-1 text-sm">
                      E-mail z hovoru:{" "}
                      <a className="text-primary" href={`mailto:${call.capturedEmail}`}>
                        {call.capturedEmail}
                      </a>
                    </p>
                  ) : null}
                </div>
                <div className="text-right text-sm">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${callResultKindTone[call.resultKind]}`}
                  >
                    {callResultKindLabel[call.resultKind]}
                  </span>
                  <p className="mt-1 font-medium">{callOutcomeLabel(call.outcome)}</p>
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
              {call.recordingUrl || call.transcript ? (
                <RecordingPlayer callId={call.id} hasTranscript={Boolean(call.transcript)} />
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

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "inline-flex min-h-11 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-white"
          : "inline-flex min-h-11 items-center rounded-lg border border-border bg-white px-3 text-sm font-medium"
      }
    >
      {label}
    </Link>
  );
}

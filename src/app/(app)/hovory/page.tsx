import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  callOutcomeLabel,
  callResultKindLabel,
  callResultKindTone,
  callStatusLabel,
  formatDateTime,
  formatDurationSec,
} from "@/lib/utils";
import { RecordingPlayer } from "@/components/recording-player";
import {
  callHistoryHasFilters,
  callHistoryStats,
  callHistoryWhere,
  parseCallHistoryFilters,
} from "@/lib/call-search";

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

function percent(part: number, total: number) {
  if (!total) return "0 %";
  return `${Math.round((part / total) * 100)} %`;
}

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseCallHistoryFilters(params);
  const filtered = callHistoryHasFilters(filters);
  const where = await callHistoryWhere(filters);

  const [calls, selection, overall] = await Promise.all([
    prisma.call.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: 250,
      include: { contact: true, campaign: true },
    }),
    callHistoryStats(where),
    filtered ? callHistoryStats({}) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hovory</h1>
        <p className="text-sm text-slate-500">
          História sa dá vyhľadať podľa mena, dátumu, času, čísla, e-mailu a úspešnosti. Štatistiky
          sa prepočítajú podľa aktuálneho výberu.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label={filtered ? "Nájdené" : "Hovory"}
          value={String(selection.total)}
          hint={filtered && overall ? `z ${overall.total} v histórii` : "v databáze"}
        />
        <Stat
          label="Úspešné"
          value={String(selection.success)}
          hint={percent(selection.success, selection.total)}
        />
        <Stat
          label="Neúspešné"
          value={String(selection.failure)}
          hint={percent(selection.failure, selection.total)}
        />
        <Stat
          label="Priemerné trvanie"
          value={formatDurationSec(selection.avgDurationSec)}
          hint={selection.pending ? `${selection.pending} ešte prebieha` : "dokončené aj nedvihnuté"}
        />
        <Stat
          label="S e-mailom"
          value={String(selection.withEmail)}
          hint="zachytený z hovoru"
        />
      </section>

      <form action="/hovory" method="get" className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium">
            Meno
            <input
              name="meno"
              defaultValue={filters.meno}
              placeholder="Jana Horváthová"
              className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"
            />
          </label>
          <label className="text-sm font-medium">
            Telefónne číslo
            <input
              name="cislo"
              defaultValue={filters.cislo}
              placeholder="+421 901 100 001"
              className="number-mono mt-1 min-h-11 w-full rounded-lg border border-border px-3"
            />
          </label>
          <label className="text-sm font-medium">
            E-mail
            <input
              name="mail"
              defaultValue={filters.mail}
              placeholder="meno@firma.sk"
              className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm font-medium">
            Dátum od
            <input name="od" type="date" defaultValue={filters.od} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
          </label>
          <label className="text-sm font-medium">
            Dátum do
            <input name="do" type="date" defaultValue={filters.do} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
          </label>
          <label className="text-sm font-medium">
            Čas od
            <input name="casOd" type="time" defaultValue={filters.casOd} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
          </label>
          <label className="text-sm font-medium">
            Čas do
            <input name="casDo" type="time" defaultValue={filters.casDo} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
          </label>
          <label className="text-sm font-medium">
            Úspešnosť
            <select name="vysledok" defaultValue={filters.vysledok} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3">
              <option value="">Všetky</option>
              <option value="uspech">Úspešné</option>
              <option value="neuspech">Neúspešné</option>
              <option value="prebieha">Prebiehajúce</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white">Hľadať</button>
          {filtered ? (
            <Link href="/hovory" className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium">
              Zrušiť filtre
            </Link>
          ) : null}
        </div>
      </form>

      <div className="space-y-3">
        {calls.length === 0 ? (
          <p className="rounded-2xl border border-border bg-white p-5 text-sm text-slate-500">
            {filtered
              ? "Tomuto hľadaniu nezodpovedá žiadny hovor. Upravte meno, dátum, číslo, e-mail alebo úspešnosť."
              : "Zatiaľ žiadne hovory. Z karty kontaktu stlačte Volat teraz."}
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
                  ) : call.contact.email ? (
                    <p className="mt-1 text-sm text-slate-500">E-mail v karte: {call.contact.email}</p>
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
                    {callStatusLabel[call.status]} · {formatDurationSec(call.durationSec)} · {call.provider}
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

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="rounded-2xl border border-border bg-white p-4 shadow-[var(--shadow-sm)]">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-2 number-mono text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </article>
  );
}

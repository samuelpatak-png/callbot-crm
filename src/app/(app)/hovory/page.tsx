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
import { overrideCallResultAction } from "@/lib/actions";
import {
  CALL_PAGE_SIZE,
  callHistoryByCampaign,
  callHistoryHasFilters,
  callHistoryQuery,
  callHistoryStats,
  callHistoryTrend,
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
  const skip = (filters.strana - 1) * CALL_PAGE_SIZE;

  const [calls, selection, overall, campaigns, byCampaign, trend] = await Promise.all([
    prisma.call.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip,
      take: CALL_PAGE_SIZE,
      include: { contact: true, campaign: true, mails: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    callHistoryStats(where),
    filtered ? callHistoryStats({}) : Promise.resolve(null),
    prisma.campaign.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    callHistoryByCampaign(where),
    callHistoryTrend(7),
  ]);

  const pages = Math.max(1, Math.ceil(selection.total / CALL_PAGE_SIZE));
  const query = callHistoryQuery(filters);
  const exportQs = query.toString();
  const pageHref = (page: number) => {
    const next = new URLSearchParams(query);
    next.set("strana", String(page));
    return `/hovory?${next.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hovory</h1>
          <p className="text-sm text-slate-500">
            História podľa mena, dátumu, času, čísla, e-mailu, kampane a úspešnosti. Štatistiky patria k
            aktuálnemu výberu.
          </p>
        </div>
        <a
          href={`/api/hovory/export${exportQs ? `?${exportQs}` : ""}`}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium"
        >
          Stiahnuť CSV
        </a>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label={filtered ? "Nájdené" : "Hovory"}
          value={String(selection.total)}
          hint={filtered && overall ? `z ${overall.total} v histórii` : "v databáze"}
        />
        <Stat label="Úspešné" value={String(selection.success)} hint={percent(selection.success, selection.total)} />
        <Stat label="Neúspešné" value={String(selection.failure)} hint={percent(selection.failure, selection.total)} />
        <Stat
          label="Priemerné trvanie"
          value={formatDurationSec(selection.avgDurationSec)}
          hint={selection.pending ? `${selection.pending} ešte prebieha` : "dokončené aj nedvihnuté"}
        />
        <Stat label="S e-mailom" value={String(selection.withEmail)} hint="zachytený z hovoru" />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Posledných 7 dní</p>
          <ul className="mt-3 space-y-1 text-sm">
            {trend.length === 0 ? <li className="text-slate-500">Zatiaľ bez hovorov v tomto týždni.</li> : null}
            {trend.map((row) => (
              <li key={row.day} className="flex justify-between gap-3">
                <span>{new Date(`${row.day}T12:00:00`).toLocaleDateString("sk-SK")}</span>
                <span className="number-mono text-slate-600">
                  {row.total} · {row.success} úsp. · {row.failure} neúsp.
                </span>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Podľa kampane</p>
          <ul className="mt-3 space-y-1 text-sm">
            {byCampaign.length === 0 ? <li className="text-slate-500">Žiadne hovory v tomto výbere.</li> : null}
            {byCampaign.slice(0, 8).map((row) => (
              <li key={row.id || "none"} className="flex justify-between gap-3">
                <span className="truncate">{row.name}</span>
                <span className="number-mono text-slate-600">{row.total}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <form action="/hovory" method="get" className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium">
            Meno
            <input name="meno" defaultValue={filters.meno} placeholder="Jana Horváthová" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
          </label>
          <label className="text-sm font-medium">
            Telefónne číslo
            <input name="cislo" defaultValue={filters.cislo} placeholder="+421 901 100 001" className="number-mono mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
          </label>
          <label className="text-sm font-medium">
            E-mail
            <input name="mail" defaultValue={filters.mail} placeholder="meno@firma.sk" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
          <label className="text-sm font-medium">
            Kampaň
            <select name="kampan" defaultValue={filters.kampan} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3">
              <option value="">Všetky</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
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
          const mail = call.mails[0];
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
                  {mail ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Podklady: {mail.status === "SENT" ? "odoslané" : mail.status === "FAILED" ? "odoslanie zlyhalo" : "čakajú na RESEND_API_KEY"}
                    </p>
                  ) : null}
                </div>
                <div className="text-right text-sm">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${callResultKindTone[call.resultKind]}`}>
                    {callResultKindLabel[call.resultKind]}
                    {call.resultOverridden ? " · ručne" : ""}
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
              {call.resultKind !== "PENDING" ? (
                <form action={overrideCallResultAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={call.id} />
                  <label className="text-xs font-medium">
                    Opraviť výsledok
                    <select name="resultKind" defaultValue={call.resultKind} className="mt-1 min-h-11 rounded-lg border border-border px-3 text-sm">
                      <option value="SUCCESS">Úspešný</option>
                      <option value="FAILURE">Neúspešný</option>
                    </select>
                  </label>
                  <input name="note" placeholder="Dôvod opravy" className="min-h-11 min-w-[12rem] flex-1 rounded-lg border border-border px-3 text-sm" />
                  <button className="min-h-11 rounded-lg border border-border px-3 text-sm">Uložiť</button>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>

      {pages > 1 ? (
        <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Stránkovanie hovorov">
          {filters.strana > 1 ? (
            <Link href={pageHref(filters.strana - 1)} className="rounded-lg border border-border px-3 py-2">
              Predošlá
            </Link>
          ) : null}
          <span className="text-slate-500">
            Strana {filters.strana} z {pages}
          </span>
          {filters.strana < pages ? (
            <Link href={pageHref(filters.strana + 1)} className="rounded-lg border border-border px-3 py-2">
              Ďalšia
            </Link>
          ) : null}
        </nav>
      ) : null}
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

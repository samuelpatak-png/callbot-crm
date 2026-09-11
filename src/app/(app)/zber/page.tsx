import { Pause, Play, Square } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ensureHarvestJob } from "@/lib/harvest";
import { HARVEST_SOURCES } from "@/lib/discover";
import { HarvestLive } from "@/components/harvest-live";
import {
  pauseHarvestAction,
  resumeHarvestAction,
  saveHarvestSettingsAction,
  startHarvestAction,
  stopHarvestAction,
} from "@/lib/actions";
import { formatDateTime, harvestSiteStatusLabel, harvestStatusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HarvestPage() {
  const job = await ensureHarvestJob();
  const [sites, queued] = await Promise.all([
    prisma.harvestedSite.findMany({
      where: { jobId: job.id },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.harvestedSite.count({ where: { jobId: job.id, status: { in: ["QUEUED", "SCANNING"] } } }),
  ]);
  const running = job.status === "RUNNING";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Zber čísiel</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Beží bez AI. Vie zbierať weby zo <strong>Zoznam.sk</strong> aj <strong>Azet.sk</strong>.
          Potom zmeria rýchlosť ich vlastnej stránky a podľa pevných pravidiel nechá len zastaralé,
          škaredé alebo inak zlé weby. Pomalé idú mimo. Telefón sa uloží len raz, v tvare +421…
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-white p-5">
        <p className="number-mono text-xs text-slate-500">{harvestStatusLabel[job.status]}</p>
        <h2 className="mt-1 text-lg font-semibold">Automatický zber</h2>
        <p className="mt-1 text-sm text-slate-500">
          Spusti, pozastav alebo zastav. Po spustení si weby prechádza sám a dopĺňa čísla do CRM.
        </p>
        {job.lastRunAt ? (
          <p className="mt-1 text-xs text-slate-500">Posledný spracovaný web: {formatDateTime(job.lastRunAt)}</p>
        ) : null}
        {job.lastError ? <p className="mt-2 text-sm text-amber-700">{job.lastError}</p> : null}
        <HarvestLive running={running} />
        <div className="mt-4 flex flex-wrap gap-2">
          {job.status === "RUNNING" ? (
            <form action={pauseHarvestAction}>
              <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium">
                <Pause className="h-4 w-4" /> Pozastaviť
              </button>
            </form>
          ) : job.status === "PAUSED" ? (
            <form action={resumeHarvestAction}>
              <button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white">
                <Play className="h-4 w-4" /> Pokračovať
              </button>
            </form>
          ) : (
            <form action={startHarvestAction}>
              <button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white">
                <Play className="h-4 w-4" /> Spustiť zber
              </button>
            </form>
          )}
          <form action={stopHarvestAction}>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-destructive/30 px-4 text-sm font-medium text-destructive">
              <Square className="h-4 w-4" /> Zastaviť
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pridané čísla" value={String(job.added)} hint={`cieľ ${job.targetNewContacts}`} />
        <Stat label="Preskenované weby" value={String(job.scanned)} hint={`${job.skippedSlow} pomalých mimo`} />
        <Stat label="Mimo pravidiel" value={String(job.skippedModern)} hint="moderné alebo nízke skóre" />
        <Stat label="V poradí" value={String(queued)} hint={`${job.skippedNoPhone} bez telefónu`} />
      </section>

      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="font-semibold">Pravidlá (žiadny model, len heuristiky)</h2>
        <ul className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <li>Pomalší web ako {job.maxLoadMs} ms sa do zoznamu nedostane.</li>
          <li>Bodovanie zastaranosti musí byť aspoň {job.minScore} (HTML 4, tabuľky, FrontPage, Joomla 1/2, chýbajúci viewport…).</li>
          <li>Next.js, Shopify, Webflow a podobné weby sa zahodia ako príliš moderné.</li>
          <li>Berú sa len .sk weby s verejným SK číslom. 0800/0900 sa ignorujú.</li>
          <li>URL aj telefón majú unikátny kľúč — to isté číslo sa neuloží dvakrát.</li>
          <li>Zdroje: Zoznam.sk (firmy) a Azet.sk (katalóg webov) — zapneš ich v nastavení.</li>
          <li>Nájdené kontakty idú do kampane „Zber zo zastaraných webov“, ak je to zapnuté.</li>
        </ul>
      </section>

      <form action={saveHarvestSettingsAction} className="grid gap-3 rounded-2xl border border-border bg-white p-5">
        <h2 className="font-semibold">Nastavenie zberu</h2>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">Zdroje webov</legend>
          {HARVEST_SOURCES.map((source) => (
            <label
              key={source.id}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/50 px-3 py-3 text-sm"
            >
              <input
                type="checkbox"
                name="sources"
                value={source.id}
                defaultChecked={job.sources.includes(source.id) || job.sources.length === 0}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{source.label}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{source.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            Max. načítanie (ms)
            <input
              name="maxLoadMs"
              type="number"
              defaultValue={job.maxLoadMs}
              className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"
            />
          </label>
          <label className="text-sm">
            Min. skóre zastaranosti
            <input
              name="minScore"
              type="number"
              defaultValue={job.minScore}
              className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"
            />
          </label>
          <label className="text-sm">
            Pauza medzi webmi (ms)
            <input
              name="delayMs"
              type="number"
              defaultValue={job.delayMs}
              className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"
            />
          </label>
          <label className="text-sm">
            Cieľ nových čísiel
            <input
              name="targetNewContacts"
              type="number"
              defaultValue={job.targetNewContacts}
              className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"
            />
          </label>
        </div>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="attachToCampaign" defaultChecked={job.attachToCampaign} />
          Pridávať čísla do kampane na volanie
        </label>
        <label className="text-sm">
          Ďalšie URL katalógov (voliteľné, jedna na riadok)
          <textarea
            name="queries"
            rows={4}
            defaultValue={job.queries.join("\n")}
            className="mt-1 w-full rounded-lg border border-border p-3 font-mono text-xs"
            placeholder={"https://www.azet.sk/katalog/…\nhttps://www.zoznam.sk/katalog/…"}
          />
        </label>
        <button className="min-h-11 max-w-xs rounded-lg bg-primary px-4 text-sm font-semibold text-white">
          Uložiť pravidlá
        </button>
      </form>

      <section className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-muted text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Web</th>
              <th className="px-4 py-3">Skóre</th>
              <th className="px-4 py-3">ms</th>
              <th className="px-4 py-3">Čísla</th>
              <th className="px-4 py-3">Výsledok</th>
              <th className="px-4 py-3">Čas</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <tr key={site.id} className="border-t border-border align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{site.title || site.domain}</p>
                  <a href={site.url} className="number-mono text-xs text-primary" target="_blank" rel="noreferrer">
                    {site.domain}
                  </a>
                  {site.reasons[0] ? <p className="mt-1 text-xs text-slate-500">{site.reasons[0]}</p> : null}
                </td>
                <td className="number-mono px-4 py-3">{site.score ?? "—"}</td>
                <td className="number-mono px-4 py-3">{site.loadMs ?? "—"}</td>
                <td className="number-mono px-4 py-3">{site.phones[0] || "—"}</td>
                <td className="px-4 py-3">{harvestSiteStatusLabel[site.status]}</td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(site.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sites.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Zatiaľ žiadny web. Spusti zber a fronta sa začne plniť sama.</p>
        ) : null}
      </section>
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

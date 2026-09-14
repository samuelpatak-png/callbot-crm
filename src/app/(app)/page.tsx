import Link from "next/link";
import { PauseCircle, PlayCircle, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { campaignStatusLabel, contactStatusLabel, callResultKindLabel, formatDateTime, formatMoney, harvestStatusLabel } from "@/lib/utils";
import { pauseCampaignAction, resumeCampaignAction, startCampaignAction, startHarvestAction } from "@/lib/actions";

export default async function DashboardPage() {
  const [contacts, callsToday, openTasks, running, deals, due, recentCalls, campaigns, harvest] =
    await Promise.all([
      prisma.contact.count(),
      prisma.call.count({
        where: { startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      prisma.task.count({ where: { status: "OPEN" } }),
      prisma.campaign.findFirst({
        where: { status: { in: ["RUNNING", "PAUSED"] } },
        include: { _count: { select: { members: true } } },
      }),
      prisma.deal.aggregate({ _sum: { value: true }, where: { stage: { notIn: ["LOST"] } } }),
      prisma.contact.findMany({
        where: { nextFollowUpAt: { not: null } },
        orderBy: { nextFollowUpAt: "asc" },
        take: 5,
      }),
      prisma.call.findMany({
        orderBy: { startedAt: "desc" },
        take: 6,
        include: { contact: true },
      }),
      prisma.campaign.findMany({ orderBy: { updatedAt: "desc" }, take: 4 }),
      prisma.harvestJob.findUnique({ where: { id: "default" } }),
    ]);

  const connected = await prisma.call.count({
    where: { startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, status: "COMPLETED" },
  });
  const successToday = await prisma.call.count({
    where: { startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, resultKind: "SUCCESS" },
  });
  const failureToday = await prisma.call.count({
    where: { startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, resultKind: "FAILURE" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="number-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            Operačné centrum
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Dnešná linka</h1>
        </div>
        <Link
          href="/kontakty/novy"
          className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-white transition duration-200 hover:opacity-90"
        >
          Pridať číslo
        </Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Kontakty" value={String(contacts)} hint="telefónne čísla v databáze" />
        <Stat label="Hovory dnes" value={String(callsToday)} hint={`${connected} spojených`} />
        <Stat label="Úspešné dnes" value={String(successToday)} hint={`${failureToday} neúspešných`} />
        <Stat
          label="Pipeline"
          value={formatMoney(deals._sum.value ?? 0)}
          hint={`${openTasks} otvorených úloh`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Automatizácia</h2>
            <Link href="/kampane" className="text-sm text-primary">
              Všetky kampane
            </Link>
          </div>
          {running ? (
            <div className="rounded-xl bg-muted p-4">
              <p className="number-mono text-xs text-slate-500">{campaignStatusLabel[running.status]}</p>
              <p className="mt-1 text-lg font-semibold">{running.name}</p>
              <p className="text-sm text-slate-500">{running._count.members} čísel v kampani</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {running.status === "RUNNING" ? (
                  <form action={pauseCampaignAction}>
                    <input type="hidden" name="id" value={running.id} />
                    <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium">
                      <PauseCircle className="h-4 w-4" /> Pozastaviť
                    </button>
                  </form>
                ) : (
                  <form action={resumeCampaignAction}>
                    <input type="hidden" name="id" value={running.id} />
                    <button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-white">
                      <PlayCircle className="h-4 w-4" /> Pokračovať
                    </button>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-slate-500">
              Žiadna kampaň nebeží. Spusti frontu a systém bude volať bez zásahu.
              {campaigns[0] ? (
                <form action={startCampaignAction} className="mt-3">
                  <input type="hidden" name="id" value={campaigns[0].id} />
                  <button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-white">
                    <PlayCircle className="h-4 w-4" /> Spustiť {campaigns[0].name}
                  </button>
                </form>
              ) : null}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Zber čísiel</h2>
            <Link href="/zber" className="text-sm text-primary">
              Pravidlá zberu
            </Link>
          </div>
          {harvest && harvest.status === "RUNNING" ? (
            <div className="rounded-xl bg-muted p-4">
              <p className="number-mono text-xs text-slate-500">{harvestStatusLabel[harvest.status]}</p>
              <p className="mt-1 text-lg font-semibold">{harvest.added} nových čísiel</p>
              <p className="text-sm text-slate-500">
                {harvest.skippedSlow} pomalých webov mimo · {harvest.duplicates} duplicít
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-slate-500">
              Hľadá zastaralé .sk weby, preskakuje pomalé a neukladá to isté číslo dvakrát.
              <form action={startHarvestAction} className="mt-3">
                <button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-white">
                  <PlayCircle className="h-4 w-4" /> Spustiť zber
                </button>
              </form>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" />
          Najbližšie termíny
        </h2>
        <ul className="space-y-3">
          {due.map((contact) => (
            <li key={contact.id} className="flex items-center justify-between gap-3 text-sm">
              <Link href={`/kontakty/${contact.id}`} className="font-medium hover:text-primary">
                {contact.firstName} {contact.lastName}
              </Link>
              <span className="number-mono text-slate-500">{formatDateTime(contact.nextFollowUpAt)}</span>
            </li>
          ))}
          {due.length === 0 ? <li className="text-sm text-slate-500">Žiadne naplánované follow-upy.</li> : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-4 font-semibold">Posledné hovory</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="pb-2">Kontakt</th>
                <th className="pb-2">Číslo</th>
                <th className="pb-2">Výsledok</th>
                <th className="pb-2">Čas</th>
              </tr>
            </thead>
            <tbody>
              {recentCalls.map((call) => (
                <tr key={call.id} className="border-t border-border">
                  <td className="py-3">
                    <Link href={`/kontakty/${call.contactId}`} className="font-medium hover:text-primary">
                      {call.contact.firstName} {call.contact.lastName}
                    </Link>
                    <p className="text-xs text-slate-500">{contactStatusLabel[call.contact.status]}</p>
                  </td>
                  <td className="number-mono py-3">{call.contact.phone}</td>
                  <td className="py-3">{callResultKindLabel[call.resultKind]} · {call.outcome || call.status}</td>
                  <td className="py-3 text-slate-500">{formatDateTime(call.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

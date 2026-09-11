import { DealStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createDealAction, updateDealStageAction } from "@/lib/actions";
import { dealStageLabel, formatMoney } from "@/lib/utils";
import { AutoSubmitSelect } from "@/components/auto-submit-select";

const STAGES: DealStage[] = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];

export default async function PipelinePage() {
  const [deals, contacts] = await Promise.all([
    prisma.deal.findMany({
      include: { contact: true, company: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.contact.findMany({ orderBy: { lastName: "asc" }, take: 100 }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-slate-500">Obchodné príležitosti viazané na čísla a hovory.</p>
        </div>
        <form action={createDealAction} className="flex flex-wrap gap-2">
          <input name="title" required placeholder="Názov dealu" className="min-h-11 rounded-lg border border-border px-3" />
          <input name="value" type="number" min="0" placeholder="EUR" className="min-h-11 w-28 rounded-lg border border-border px-3" />
          <select name="contactId" className="min-h-11 rounded-lg border border-border px-3">
            <option value="">Bez kontaktu</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
          <button className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-white">Pridať</button>
        </form>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const cards = deals.filter((deal) => deal.stage === stage);
          const sum = cards.reduce((acc, deal) => acc + Number(deal.value), 0);
          return (
            <section key={stage} className="min-w-[240px] flex-1 rounded-2xl border border-border bg-muted/60 p-3">
              <header className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{dealStageLabel[stage]}</h2>
                <span className="number-mono text-xs text-slate-500">{formatMoney(sum)}</span>
              </header>
              <div className="space-y-2">
                {cards.map((deal) => (
                  <article key={deal.id} className="rounded-xl border border-border bg-white p-3 shadow-[var(--shadow-sm)]">
                    <p className="font-medium">{deal.title}</p>
                    <p className="number-mono text-sm text-slate-500">{formatMoney(Number(deal.value))}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}` : "Bez kontaktu"}
                    </p>
                    <form action={updateDealStageAction} className="mt-2">
                      <input type="hidden" name="id" value={deal.id} />
                      <AutoSubmitSelect name="stage" defaultValue={deal.stage}>
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {dealStageLabel[s]}
                          </option>
                        ))}
                      </AutoSubmitSelect>
                    </form>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

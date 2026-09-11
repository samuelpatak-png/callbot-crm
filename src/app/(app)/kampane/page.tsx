import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createCampaignAction } from "@/lib/actions";
import { campaignStatusLabel } from "@/lib/utils";

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { members: true, calls: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kampane</h1>
        <p className="text-sm text-slate-500">
          Fronta čísel, ktorú vieš spustiť, pozastaviť alebo zastaviť. Firemný skript pre ChatGPT sa
          nastavuje v <Link href="/skript" className="text-primary underline-offset-2 hover:underline">Skripte</Link>.
        </p>
      </div>

      <form action={createCampaignAction} className="grid gap-3 rounded-2xl border border-border bg-white p-5">
        <h2 className="font-semibold">Nová kampaň</h2>
        <input name="name" required placeholder="Názov" className="min-h-11 rounded-lg border border-border px-3" />
        <textarea name="description" placeholder="Popis" className="rounded-lg border border-border p-3" rows={2} />
        <textarea
          name="scriptPrompt"
          placeholder="Cieľ tejto kampane — ChatGPT ho pridá k firemnému skriptu (dohodnúť demo, preveriť záujem…)"
          className="rounded-lg border border-border p-3"
          rows={3}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Pauza medzi hovormi (ms)
            <input name="delayBetweenCallsMs" type="number" defaultValue={4000} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
          </label>
          <label className="text-sm">
            Počet pokusov
            <input name="retryAttempts" type="number" defaultValue={2} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
          </label>
        </div>
        <button className="min-h-11 max-w-xs rounded-lg bg-accent px-4 font-semibold text-white">Vytvoriť kampaň</button>
      </form>

      <div className="grid gap-3">
        {campaigns.map((campaign) => (
          <Link
            key={campaign.id}
            href={`/kampane/${campaign.id}`}
            className="rounded-2xl border border-border bg-white p-5 transition duration-200 hover:shadow-[var(--shadow-md)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{campaign.name}</h2>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                {campaignStatusLabel[campaign.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{campaign.description || "Bez popisu"}</p>
            <p className="mt-2 number-mono text-xs text-slate-500">
              {campaign._count.members} čísel · {campaign._count.calls} hovorov
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

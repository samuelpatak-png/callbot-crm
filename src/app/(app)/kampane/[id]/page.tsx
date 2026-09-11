import { notFound } from "next/navigation";
import Link from "next/link";
import { Pause, Play, Square } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  addContactsToCampaignAction,
  pauseCampaignAction,
  resumeCampaignAction,
  startCampaignAction,
  stopCampaignAction,
} from "@/lib/actions";
import { campaignStatusLabel, contactStatusLabel, formatDateTime } from "@/lib/utils";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      members: {
        include: { contact: true },
        orderBy: { queuePosition: "asc" },
      },
      calls: { orderBy: { startedAt: "desc" }, take: 12, include: { contact: true } },
    },
  });
  if (!campaign) notFound();

  const pending = campaign.members.filter((m) => m.status === "PENDING").length;
  const done = campaign.members.filter((m) => m.status === "COMPLETED").length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-white p-5">
        <p className="number-mono text-xs text-slate-500">{campaignStatusLabel[campaign.status]}</p>
        <h1 className="text-2xl font-semibold">{campaign.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{campaign.description}</p>
        {campaign.scriptPrompt ? (
          <p className="mt-2 text-sm text-slate-600">
            Cieľ pre ChatGPT: {campaign.scriptPrompt}{" "}
            <Link href="/skript" className="text-primary underline-offset-2 hover:underline">
              Upraviť firemný skript
            </Link>
          </p>
        ) : null}
        <p className="mt-3 text-sm">
          Fronta: {pending} čaká · {done} dokončených · {campaign.members.length} spolu
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {campaign.status !== "RUNNING" ? (
            campaign.status === "PAUSED" ? (
              <form action={resumeCampaignAction}>
                <input type="hidden" name="id" value={campaign.id} />
                <button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white">
                  <Play className="h-4 w-4" /> Pokračovať
                </button>
              </form>
            ) : (
              <form action={startCampaignAction}>
                <input type="hidden" name="id" value={campaign.id} />
                <button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white">
                  <Play className="h-4 w-4" /> Spustiť
                </button>
              </form>
            )
          ) : (
            <form action={pauseCampaignAction}>
              <input type="hidden" name="id" value={campaign.id} />
              <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium">
                <Pause className="h-4 w-4" /> Pozastaviť
              </button>
            </form>
          )}
          <form action={stopCampaignAction}>
            <input type="hidden" name="id" value={campaign.id} />
            <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-destructive/30 px-4 text-sm font-medium text-destructive">
              <Square className="h-4 w-4" /> Zastaviť
            </button>
          </form>
        </div>
      </div>

      <form action={addContactsToCampaignAction} className="flex flex-wrap gap-2 rounded-2xl border border-border bg-white p-4">
        <input type="hidden" name="campaignId" value={campaign.id} />
        <select name="mode" className="min-h-11 rounded-lg border border-border px-3">
          <option value="new">Pridať nové kontakty</option>
          <option value="all">Pridať všetky volateľné</option>
        </select>
        <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white">Naplniť frontu</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Kontakt</th>
              <th className="px-4 py-3">Číslo</th>
              <th className="px-4 py-3">CRM stav</th>
              <th className="px-4 py-3">Fronta</th>
              <th className="px-4 py-3">Pokusy</th>
            </tr>
          </thead>
          <tbody>
            {campaign.members.map((member) => (
              <tr key={member.id} className="border-t border-border">
                <td className="number-mono px-4 py-3">{member.queuePosition}</td>
                <td className="px-4 py-3">
                  {member.contact.firstName} {member.contact.lastName}
                </td>
                <td className="number-mono px-4 py-3">{member.contact.phone}</td>
                <td className="px-4 py-3">{contactStatusLabel[member.contact.status]}</td>
                <td className="px-4 py-3">{member.status}</td>
                <td className="px-4 py-3">{member.attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="mb-3 font-semibold">Hovory kampane</h2>
        <ul className="space-y-2 text-sm">
          {campaign.calls.map((call) => (
            <li key={call.id} className="flex flex-wrap justify-between gap-2 border-b border-border py-2">
              <span>
                {call.contact.firstName} {call.contact.lastName} · {call.outcome}
              </span>
              <span className="number-mono text-slate-500">{formatDateTime(call.startedAt)}</span>
            </li>
          ))}
          {campaign.calls.length === 0 ? <li className="text-slate-500">Zatiaľ žiadne hovory.</li> : null}
        </ul>
      </section>
    </div>
  );
}

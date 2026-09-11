import { prisma } from "@/lib/prisma";
import { callStatusLabel, formatDateTime } from "@/lib/utils";
import Link from "next/link";

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
        <p className="text-sm text-slate-500">História manuálnych aj automatických volaní.</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-muted text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Čas</th>
              <th className="px-4 py-3">Kontakt</th>
              <th className="px-4 py-3">Číslo</th>
              <th className="px-4 py-3">Stav</th>
              <th className="px-4 py-3">Výsledok</th>
              <th className="px-4 py-3">Poskytovateľ</th>
              <th className="px-4 py-3">Trvanie</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call.id} className="border-t border-border">
                <td className="px-4 py-3 text-slate-500">{formatDateTime(call.startedAt)}</td>
                <td className="px-4 py-3">
                  <Link href={`/kontakty/${call.contactId}`} className="font-medium hover:text-primary">
                    {call.contact.firstName} {call.contact.lastName}
                  </Link>
                  {call.campaign ? <p className="text-xs text-slate-500">{call.campaign.name}</p> : null}
                </td>
                <td className="number-mono px-4 py-3">{call.contact.phone}</td>
                <td className="px-4 py-3">{callStatusLabel[call.status]}</td>
                <td className="px-4 py-3">{call.outcome || "—"}</td>
                <td className="px-4 py-3">{call.provider}</td>
                <td className="number-mono px-4 py-3">{call.durationSec}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

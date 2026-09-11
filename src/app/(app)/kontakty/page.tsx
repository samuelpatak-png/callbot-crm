import Link from "next/link";
import { ContactStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { contactStatusLabel, contactStatusTone, formatDateTime } from "@/lib/utils";
import { importContactsAction, placeCallAction } from "@/lib/actions";
import { Phone } from "lucide-react";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || "";
  const status = params.status as ContactStatus | undefined;

  const contacts = await prisma.contact.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { company: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Telefónne čísla</h1>
          <p className="text-sm text-slate-500">Volaj, filtruj, importuj a zapisuj follow-upy.</p>
        </div>
        <Link
          href="/kontakty/novy"
          className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-white"
        >
          Nový kontakt
        </Link>
      </div>

      <form className="flex flex-wrap gap-2" action="/kontakty">
        <input
          name="q"
          defaultValue={q}
          placeholder="Hľadať meno, číslo, e-mail"
          className="min-h-11 min-w-[220px] flex-1 rounded-lg border border-border bg-white px-3"
        />
        <select
          name="status"
          defaultValue={status || ""}
          className="min-h-11 rounded-lg border border-border bg-white px-3"
        >
          <option value="">Všetky stavy</option>
          {Object.entries(contactStatusLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="min-h-11 rounded-lg border border-border bg-white px-4 text-sm font-medium">
          Filtrovať
        </button>
      </form>

      <div className="rounded-2xl border border-border bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold">Import CSV</h2>
        <p className="mb-3 text-xs text-slate-500">
          Jeden riadok = jeden kontakt. Stĺpce: meno, priezvisko, telefón. Alebo len stĺpec s číslom.
        </p>
        <form action={importContactsAction} className="space-y-2">
          <textarea
            name="csv"
            rows={3}
            className="w-full rounded-lg border border-border bg-muted p-3 font-mono text-sm"
            placeholder={"Martin,Kováč,+421901100011"}
          />
          <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white">
            Importovať čísla
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-[var(--shadow-sm)]">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-muted text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Kontakt</th>
              <th className="px-4 py-3">Číslo</th>
              <th className="px-4 py-3">Firma</th>
              <th className="px-4 py-3">Stav</th>
              <th className="px-4 py-3">Follow-up</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Link href={`/kontakty/${contact.id}`} className="font-medium hover:text-primary">
                    {contact.firstName} {contact.lastName}
                  </Link>
                  <p className="text-xs text-slate-500">{contact.title || "—"}</p>
                </td>
                <td className="number-mono px-4 py-3">{contact.phone}</td>
                <td className="px-4 py-3">{contact.company?.name || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${contactStatusTone[contact.status]}`}>
                    {contactStatusLabel[contact.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(contact.nextFollowUpAt)}</td>
                <td className="px-4 py-3">
                  <form action={placeCallAction}>
                    <input type="hidden" name="contactId" value={contact.id} />
                    <button
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-white disabled:opacity-40"
                      disabled={contact.doNotCall || contact.status === "DNC"}
                    >
                      <Phone className="h-4 w-4" />
                      Volat
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {contacts.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Žiadne kontakty. Pridaj číslo alebo importuj CSV.</p>
        ) : null}
      </div>
    </div>
  );
}

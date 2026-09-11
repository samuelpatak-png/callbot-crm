import { notFound } from "next/navigation";
import { Phone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  addNoteAction,
  addTaskAction,
  placeCallAction,
  updateContactAction,
} from "@/lib/actions";
import { contactStatusLabel, contactStatusTone, callOutcomeLabel, formatDateTime } from "@/lib/utils";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      company: true,
      notes: { orderBy: { createdAt: "desc" }, include: { author: true } },
      tasks: { orderBy: { dueAt: "asc" } },
      calls: { orderBy: { startedAt: "desc" }, take: 20 },
      activities: { orderBy: { createdAt: "desc" }, take: 20 },
      tags: { include: { tag: true } },
    },
  });
  if (!contact) notFound();

  const toInput = contact.nextFollowUpAt
    ? new Date(contact.nextFollowUpAt.getTime() - contact.nextFollowUpAt.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";

  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="space-y-4">
        <div className="rounded-2xl border border-border bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="number-mono text-xs text-slate-500">{contact.phone}</p>
              <h1 className="text-2xl font-semibold">
                {contact.firstName} {contact.lastName}
              </h1>
              <p className="text-sm text-slate-500">
                {contact.title || "Bez pozície"} · {contact.company?.name || "Bez firmy"} · {contact.city || "—"}
              </p>
              {contact.websiteUrl ? (
                <a href={contact.websiteUrl} className="mt-1 inline-block text-sm text-primary" target="_blank" rel="noreferrer">
                  {contact.websiteUrl}
                </a>
              ) : null}
            </div>
            <form action={placeCallAction}>
              <input type="hidden" name="contactId" value={contact.id} />
              <button
                disabled={contact.doNotCall}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                <Phone className="h-4 w-4" />
                Volat teraz
              </button>
            </form>
          </div>
          <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-medium ${contactStatusTone[contact.status]}`}>
            {contactStatusLabel[contact.status]}
          </span>
        </div>

        <form action={updateContactAction} key={contact.updatedAt.toISOString()} className="grid gap-3 rounded-2xl border border-border bg-white p-5">
          <input type="hidden" name="id" value={contact.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Meno
              <input name="firstName" defaultValue={contact.firstName} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
            </label>
            <label className="text-sm font-medium">
              Priezvisko
              <input name="lastName" defaultValue={contact.lastName} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
            </label>
          </div>
          <label className="text-sm font-medium">
            Telefón
            <input name="phone" defaultValue={contact.phone} className="number-mono mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
          </label>
          <label className="text-sm font-medium">
            E-mail
            <input name="email" defaultValue={contact.email ?? ""} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Stav
              <select name="status" defaultValue={contact.status} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3">
                {Object.entries(contactStatusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Follow-up
              <input name="nextFollowUpAt" type="datetime-local" defaultValue={toInput} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="doNotCall" defaultChecked={contact.doNotCall} />
            Nevolať (DNC)
          </label>
          <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white">Uložiť zmeny</button>
        </form>
      </section>

      <section className="space-y-4">
        <form action={addNoteAction} className="rounded-2xl border border-border bg-white p-5">
          <h2 className="font-semibold">Poznámka</h2>
          <input type="hidden" name="contactId" value={contact.id} />
          <textarea name="body" rows={3} required className="mt-3 w-full rounded-lg border border-border p-3" placeholder="Čo odznelo na hovore, ďalší krok..." />
          <button className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-medium">Pridať poznámku</button>
        </form>

        <form action={addTaskAction} className="rounded-2xl border border-border bg-white p-5">
          <h2 className="font-semibold">Úloha / termín</h2>
          <input type="hidden" name="contactId" value={contact.id} />
          <input name="title" required placeholder="Napr. Spätné volanie" className="mt-3 min-h-11 w-full rounded-lg border border-border px-3" />
          <input name="dueAt" type="datetime-local" className="mt-2 min-h-11 w-full rounded-lg border border-border px-3" />
          <button className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-medium">Naplánovať</button>
        </form>

        <div className="rounded-2xl border border-border bg-white p-5">
          <h2 className="mb-3 font-semibold">Hovory</h2>
          {contact.calls.length === 0 ? (
            <p className="text-sm text-slate-500">Zatiaľ žiadny hovor. Po volaní sa tu objaví zhrnutie a prepis.</p>
          ) : (
            <ol className="space-y-4">
              {contact.calls.map((call) => (
                <li key={call.id} className="border-l-2 border-slate-200 pl-3 text-sm">
                  <p className="font-medium">
                    {callOutcomeLabel(call.outcome)} · {call.durationSec}s
                  </p>
                  <p className="text-xs text-slate-500">{formatDateTime(call.startedAt)}</p>
                  {call.summary ? <p className="mt-1 text-slate-700">{call.summary}</p> : null}
                  {call.transcript ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-primary">Prepis</summary>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-5 text-slate-700">
                        {call.transcript}
                      </pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-white p-5">
          <h2 className="mb-3 font-semibold">Časová os</h2>
          <ol className="space-y-3">
            {contact.activities.map((item) => (
              <li key={item.id} className="border-l-2 border-primary/30 pl-3 text-sm">
                <p className="font-medium">{item.message}</p>
                <p className="number-mono text-xs text-slate-500">{formatDateTime(item.createdAt)}</p>
              </li>
            ))}
            {contact.notes.map((note) => (
              <li key={note.id} className="border-l-2 border-accent/40 pl-3 text-sm">
                <p>{note.body}</p>
                <p className="text-xs text-slate-500">
                  {note.author?.name || "Systém"} · {formatDateTime(note.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}

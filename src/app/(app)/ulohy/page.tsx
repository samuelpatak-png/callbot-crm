import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { addTaskAction, completeTaskAction } from "@/lib/actions";
import { formatDateTime } from "@/lib/utils";

export default async function TasksPage() {
  const [tasks, contacts] = await Promise.all([
    prisma.task.findMany({
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      include: { contact: true },
    }),
    prisma.contact.findMany({ orderBy: { lastName: "asc" }, take: 100 }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Úlohy a termíny</h1>
        <p className="text-sm text-slate-500">Follow-upy po hovore. Po termíne ich dialer zaradí späť do fronty.</p>
      </div>

      <form action={addTaskAction} className="grid gap-2 rounded-2xl border border-border bg-white p-4 sm:grid-cols-4">
        <input name="title" required placeholder="Úloha" className="min-h-11 rounded-lg border border-border px-3" />
        <input name="dueAt" type="datetime-local" className="min-h-11 rounded-lg border border-border px-3" />
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

      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4">
            <div>
              <p className={task.status === "DONE" ? "text-slate-400 line-through" : "font-medium"}>{task.title}</p>
              <p className="text-xs text-slate-500">
                {task.contact ? (
                  <Link href={`/kontakty/${task.contactId}`} className="hover:text-primary">
                    {task.contact.firstName} {task.contact.lastName}
                  </Link>
                ) : (
                  "Interná úloha"
                )}{" "}
                · {formatDateTime(task.dueAt)}
              </p>
            </div>
            {task.status === "OPEN" ? (
              <form action={completeTaskAction}>
                <input type="hidden" name="id" value={task.id} />
                <button className="min-h-11 rounded-lg border border-border px-3 text-sm">Hotovo</button>
              </form>
            ) : (
              <span className="text-xs text-accent">Splnené</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

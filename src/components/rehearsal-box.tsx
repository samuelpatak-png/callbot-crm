"use client";

import { useActionState } from "react";
import { rehearsePlaybookAction, type RehearseState } from "@/lib/actions";

const initial: RehearseState = { reply: "", error: "" };

export function RehearsalBox({ hasApiKey }: { hasApiKey: boolean }) {
  const [state, action, pending] = useActionState(rehearsePlaybookAction, initial);

  return (
    <form action={action} className="grid gap-3">
      <label className="text-sm font-medium">
        Zákazník na linke povie
        <textarea
          name="customerLine"
          required
          rows={3}
          className="mt-1 w-full rounded-lg border border-border p-3"
          placeholder="Nemám záujem, je to drahé a nemám čas."
        />
      </label>
      <button
        className="min-h-11 max-w-sm rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
        disabled={pending}
      >
        {pending ? "ChatGPT číta skript…" : "Nech ChatGPT argumentuje zo skriptu"}
      </button>
      {!hasApiKey ? (
        <p className="text-sm text-amber-700">
          V Nastaveniach ešte nie je OpenAI kľúč — skúška aj živý hovor ho potrebujú, aby model skript načítal.
        </p>
      ) : null}
      {state.error ? <p className="text-sm text-amber-700">{state.error}</p> : null}
      {state.reply ? (
        <blockquote className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          {state.reply}
        </blockquote>
      ) : null}
    </form>
  );
}

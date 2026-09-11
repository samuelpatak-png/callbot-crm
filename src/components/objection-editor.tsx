"use client";

import { useState } from "react";

type Row = { objection: string; reply: string };

export function ObjectionEditor({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ objection: "", reply: "" }]);

  return (
    <div className="grid gap-3">
      <input type="hidden" name="objections" value={JSON.stringify(rows)} />
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 rounded-xl border border-border bg-muted/40 p-3 sm:grid-cols-2">
          <label className="text-sm">
            Keď zákazník povie
            <textarea
              rows={3}
              value={row.objection}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...next[index], objection: event.target.value };
                setRows(next);
              }}
              className="mt-1 w-full rounded-lg border border-border bg-white p-3"
              placeholder="Je to drahé / nemám čas / už to máme"
            />
          </label>
          <label className="text-sm">
            ChatGPT má argumentovať
            <textarea
              rows={3}
              value={row.reply}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...next[index], reply: event.target.value };
                setRows(next);
              }}
              className="mt-1 w-full rounded-lg border border-border bg-white p-3"
              placeholder="Presná odpoveď, fakty, čísla, podmienky"
            />
          </label>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium"
          onClick={() => setRows([...rows, { objection: "", reply: "" }])}
        >
          Pridať námietku
        </button>
        {rows.length > 1 ? (
          <button
            type="button"
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-slate-600"
            onClick={() => setRows(rows.slice(0, -1))}
          >
            Odstrániť poslednú
          </button>
        ) : null}
      </div>
    </div>
  );
}

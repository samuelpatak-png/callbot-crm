"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/20 bg-white p-6">
      <h1 className="text-lg font-semibold">Niečo sa pokazilo</h1>
      <p className="mt-2 text-sm text-slate-500">{error.message}</p>
      <button onClick={reset} className="mt-4 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white">
        Skúsiť znova
      </button>
    </div>
  );
}

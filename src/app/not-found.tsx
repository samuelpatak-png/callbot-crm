export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="rounded-2xl border border-border bg-white p-8">
        <h1 className="text-xl font-semibold">Stránka sa nenašla</h1>
        <p className="mt-2 text-sm text-slate-500">Skontroluj adresu alebo sa vráť na prehľad.</p>
        <a href="/" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary">
          Späť na CRM
        </a>
      </div>
    </main>
  );
}

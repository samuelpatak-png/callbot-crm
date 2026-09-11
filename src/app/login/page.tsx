import Link from "next/link";
import { loginAction } from "@/lib/actions";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#dbeafe,_#f8fafc_55%)] px-4">
      <section className="w-full max-w-md rounded-2xl border border-border bg-white p-8 shadow-[var(--shadow-lg)]">
        <p className="number-mono text-[11px] font-semibold tracking-[0.2em] text-primary uppercase">
          CallBot
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Prihlásenie do CRM</h1>
        <p className="mt-2 text-sm text-slate-500">
          Outbound linka, poznámky a automatizácia volaní na jednom mieste.
        </p>
        <form action={loginAction} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            E-mail
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              defaultValue="admin@callbot.local"
              className="mt-1 min-h-11 w-full rounded-lg border border-border bg-muted px-3 text-base transition-colors duration-200 focus:border-primary"
            />
          </label>
          <label className="block text-sm font-medium">
            Heslo
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 min-h-11 w-full rounded-lg border border-border bg-muted px-3 text-base transition-colors duration-200 focus:border-primary"
            />
          </label>
          {params.error ? (
            <p className="text-sm text-destructive" role="alert">
              Nesprávny e-mail alebo heslo.
            </p>
          ) : null}
          <button
            type="submit"
            className="min-h-11 w-full rounded-lg bg-accent px-4 font-semibold text-white transition duration-200 hover:opacity-90"
          >
            Prihlásiť sa
          </button>
        </form>
        <p className="mt-5 text-xs text-slate-500">
          Predvolený účet po nasadení: admin@callbot.local. Heslo nastavíš v premenných Vercelu.
        </p>
        <p className="mt-3 text-xs text-slate-400">
          <Link href="/" className="underline-offset-2 hover:underline">
            Späť na aplikáciu
          </Link>
        </p>
      </section>
    </main>
  );
}

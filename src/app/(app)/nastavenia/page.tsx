import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { changePasswordAction, createUserAction, saveSettingsAction } from "@/lib/actions";
import { getRuntimeConfig, maskSecret, secretStored } from "@/lib/settings";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ heslo?: string; ucet?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const params = await searchParams;
  const admin = session.role === "ADMIN";
  const [settings, config, users] = await Promise.all([
    prisma.appSettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }),
    getRuntimeConfig(),
    admin ? prisma.user.findMany({ orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nastavenia</h1>
        <p className="text-sm text-slate-500">
          Kľúče radšej dajte do Vercelu. V databáze sa neukazujú. Živý hovor môže ísť cez Twilio
          (Gather) alebo cez Zadarma + ChatGPT Live na VPS. Po hovore sa zapíše CRM a prehrá
          skutočná nahrávka.{" "}
          <Link href="/skript" className="text-primary underline-offset-2 hover:underline">
            Skript
          </Link>
          .
        </p>
      </div>

      {session.mustChangePassword || params.heslo === "1" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          Predvolené heslo treba zmeniť. Repo je verejné, staré heslo tam nepatrí.
        </p>
      ) : null}
      {params.heslo === "ok" ? <p className="text-sm text-emerald-700">Heslo je zmenené.</p> : null}
      {params.heslo === "zle" ? <p className="text-sm text-destructive">Terajšie heslo nesedí.</p> : null}
      {params.heslo === "kratke" ? <p className="text-sm text-destructive">Nové heslo musí mať aspoň 10 znakov.</p> : null}

      <form action={changePasswordAction} className="grid gap-4 rounded-2xl border border-border bg-white p-6">
        <h2 className="font-semibold">Zmena hesla</h2>
        <label className="text-sm font-medium">
          Terajšie heslo
          <input name="currentPassword" type="password" required className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
        </label>
        <label className="text-sm font-medium">
          Nové heslo
          <input name="newPassword" type="password" required minLength={10} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
        </label>
        <button className="min-h-11 rounded-lg border border-border px-4 font-semibold">Zmeniť heslo</button>
      </form>

      {admin ? (
        <>
          <form action={saveSettingsAction} className="grid gap-4 rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold">Hlas a kľúče</h2>
            <label className="text-sm font-medium">
              Názov spoločnosti
              <input name="companyName" defaultValue={settings.companyName} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
            </label>
            <label className="text-sm font-medium">
              Poskytovateľ hovorov
              <select name="voiceProvider" defaultValue={settings.voiceProvider} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3">
                <option value="STUB">Simulácia</option>
                <option value="TWILIO">Twilio — živý hovor</option>
                <option value="ZADARMA_REALTIME">Zadarma — ChatGPT Live</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Twilio Account SID {config.twilioFromEnv ? "(Vercel)" : ""}
              <input name="twilioAccountSid" placeholder={maskSecret(secretStored(settings.twilioAccountSid), config.twilioFromEnv)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" autoComplete="off" />
            </label>
            <label className="text-sm font-medium">
              Twilio Auth Token
              <input name="twilioAuthToken" type="password" placeholder={maskSecret(secretStored(settings.twilioAuthToken), config.twilioFromEnv)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" autoComplete="off" />
            </label>
            <label className="text-sm font-medium">
              Twilio odchádzajúce číslo
              <input name="twilioFromNumber" defaultValue={settings.twilioFromNumber ?? ""} placeholder="+421..." className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
            </label>
            <label className="text-sm font-medium">
              OpenAI API kľúč {config.openaiFromEnv ? "(Vercel)" : ""}
              <input name="openaiApiKey" type="password" placeholder={maskSecret(secretStored(settings.openaiApiKey), config.openaiFromEnv)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" autoComplete="off" />
            </label>
            <label className="text-sm font-medium">
              OpenAI Realtime model
              <input name="openaiRealtimeModel" defaultValue={settings.openaiRealtimeModel} placeholder="gpt-realtime" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
            </label>
            <label className="text-sm font-medium">
              Hlas ChatGPT Live
              <input name="openaiRealtimeVoice" defaultValue={settings.openaiRealtimeVoice} placeholder="marin" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
            </label>
            <label className="text-sm font-medium">
              Zadarma API kľúč {config.zadarmaFromEnv ? "(Vercel)" : ""}
              <input name="zadarmaApiKey" placeholder={maskSecret(secretStored(settings.zadarmaApiKey), config.zadarmaFromEnv)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" autoComplete="off" />
            </label>
            <label className="text-sm font-medium">
              Zadarma API secret
              <input name="zadarmaApiSecret" type="password" placeholder={maskSecret(secretStored(settings.zadarmaApiSecret), config.zadarmaFromEnv)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" autoComplete="off" />
            </label>
            <label className="text-sm font-medium">
              Zadarma SIP číslo
              <input name="zadarmaSipNumber" defaultValue={settings.zadarmaSipNumber ?? ""} placeholder="12345-100" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
            </label>
            <label className="text-sm font-medium">
              Zadarma SIP heslo
              <input name="zadarmaSipPassword" type="password" placeholder={maskSecret(secretStored(settings.zadarmaSipPassword), false)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" autoComplete="off" />
            </label>
            <label className="text-sm font-medium">
              Bridge server URL
              <input name="bridgeServerUrl" defaultValue={settings.bridgeServerUrl ?? ""} placeholder="https://bridge.vas-vps.example" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
            </label>
            <button className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-white">Uložiť nastavenia</button>
          </form>

          <form action={createUserAction} className="grid gap-4 rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold">Účty</h2>
            {params.ucet === "ok" ? <p className="text-sm text-emerald-700">Účet je vytvorený.</p> : null}
            {params.ucet === "chyba" ? <p className="text-sm text-destructive">E-mail, meno a heslo (10+ znakov) sú povinné.</p> : null}
            <ul className="text-sm text-slate-600">
              {users.map((user) => (
                <li key={user.id}>
                  {user.name} · {user.email} · {user.role === "ADMIN" ? "správca" : "agent"}
                </li>
              ))}
            </ul>
            <label className="text-sm font-medium">
              Meno
              <input name="name" required className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
            </label>
            <label className="text-sm font-medium">
              E-mail
              <input name="email" type="email" required className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
            </label>
            <label className="text-sm font-medium">
              Dočasné heslo
              <input name="password" type="password" required minLength={10} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
            </label>
            <label className="text-sm font-medium">
              Rola
              <select name="role" defaultValue="AGENT" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3">
                <option value="AGENT">Agent</option>
                <option value="ADMIN">Správca</option>
              </select>
            </label>
            <button className="min-h-11 rounded-lg border border-border px-4 font-semibold">Pridať účet</button>
          </form>
        </>
      ) : (
        <p className="text-sm text-slate-500">Kľúče Twilio, Zadarma a OpenAI vie meniť len správca.</p>
      )}
    </div>
  );
}

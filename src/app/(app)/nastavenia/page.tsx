import { prisma } from "@/lib/prisma";
import { saveSettingsAction } from "@/lib/actions";
import Link from "next/link";

export default async function SettingsPage() {
  const settings = await prisma.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nastavenia</h1>
        <p className="text-sm text-slate-500">
          Twilio a ChatGPT Live API. Skript, predstavenie a argumenty nastavíš v{" "}
          <Link href="/skript" className="text-primary underline-offset-2 hover:underline">
            Skripte
          </Link>
          . Kým kľúče nie sú vyplnené, dialer používa simuláciu.
        </p>
      </div>
      <form action={saveSettingsAction} className="grid gap-4 rounded-2xl border border-border bg-white p-6">
        <label className="text-sm font-medium">
          Názov spoločnosti
          <input name="companyName" defaultValue={settings.companyName} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
        </label>
        <label className="text-sm font-medium">
          Poskytovateľ hovorov
          <select name="voiceProvider" defaultValue={settings.voiceProvider} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3">
            <option value="STUB">Simulácia (teraz)</option>
            <option value="TWILIO">Twilio API</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Twilio Account SID
          <input name="twilioAccountSid" defaultValue={settings.twilioAccountSid ?? ""} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
        </label>
        <label className="text-sm font-medium">
          Twilio Auth Token
          <input name="twilioAuthToken" type="password" defaultValue={settings.twilioAuthToken ?? ""} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
        </label>
        <label className="text-sm font-medium">
          Twilio odchádzajúce číslo
          <input name="twilioFromNumber" defaultValue={settings.twilioFromNumber ?? ""} placeholder="+421..." className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
        </label>
        <label className="text-sm font-medium">
          OpenAI API kľúč (ChatGPT Realtime)
          <input name="openaiApiKey" type="password" defaultValue={settings.openaiApiKey ?? ""} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
        </label>
        <label className="text-sm font-medium">
          Realtime model
          <input name="openaiRealtimeModel" defaultValue={settings.openaiRealtimeModel} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" />
        </label>
        <button className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-white">Uložiť nastavenia</button>
      </form>
    </div>
  );
}

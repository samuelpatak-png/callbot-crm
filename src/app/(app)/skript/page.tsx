import { prisma } from "@/lib/prisma";
import {
  compileAgentInstructions,
  ensurePlaybook,
  parseObjections,
} from "@/lib/agent-briefing";
import { savePlaybookAction } from "@/lib/actions";
import { ObjectionEditor } from "@/components/objection-editor";
import { RehearsalBox } from "@/components/rehearsal-box";

export const dynamic = "force-dynamic";

export default async function PlaybookPage() {
  const [playbook, settings] = await Promise.all([
    ensurePlaybook(),
    prisma.appSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    }),
  ]);
  const instructions = compileAgentInstructions({
    playbook,
    companyName: settings.companyName,
  });
  const objections = parseObjections(playbook.objections);
  const filled =
    Boolean(playbook.openingLine.trim() || playbook.offer.trim() || playbook.companyAbout.trim());

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Skript pre ChatGPT</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Toto nie je poznámka do šuplíka. Polia sa poskladajú do briefingu, ktorý ChatGPT Realtime
          dostane ako inštrukcie pri každom hovore a z ktorého musí argumentovať. Čo tu nie je, to
          si nemá vymýšľať.
        </p>
      </div>

      <form action={savePlaybookAction} className="grid gap-5">
        <section className="grid gap-4 rounded-2xl border border-border bg-white p-5">
          <h2 className="font-semibold">Kto sme a ako sa predstaviť</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Názov firmy
              <input
                name="companyName"
                defaultValue={settings.companyName}
                className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"
                placeholder="Acme s.r.o."
              />
            </label>
            <label className="text-sm font-medium">
              Ako sa agent predstaví
              <input
                name="agentName"
                defaultValue={playbook.agentName}
                className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"
                placeholder="som Mária z firmy Acme"
              />
            </label>
          </div>
          <label className="text-sm font-medium">
            Kto sme
            <textarea
              name="companyAbout"
              rows={4}
              defaultValue={playbook.companyAbout}
              className="mt-1 w-full rounded-lg border border-border p-3"
              placeholder="Čo firma robí, pre koho, odkedy, čím sme iní."
            />
          </label>
          <label className="text-sm font-medium">
            Prvá veta na začiatku hovoru
            <textarea
              name="openingLine"
              rows={3}
              defaultValue={playbook.openingLine}
              className="mt-1 w-full rounded-lg border border-border p-3"
              placeholder="Dobrý deň, volám z Acme, neruším vás na dve minúty? Chcem sa spýtať na váš web / služby…"
            />
          </label>
          <label className="text-sm font-medium">
            Tón hovoru
            <input
              name="tone"
              defaultValue={playbook.tone}
              className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"
            />
          </label>
        </section>

        <section className="grid gap-4 rounded-2xl border border-border bg-white p-5">
          <h2 className="font-semibold">Čo máme v ponuke</h2>
          <label className="text-sm font-medium">
            Ponuka
            <textarea
              name="offer"
              rows={5}
              defaultValue={playbook.offer}
              className="mt-1 w-full rounded-lg border border-border p-3"
              placeholder="Čo predávame, pre koho to je, čo zákazník dostane, cena len ak ju smie povedať."
            />
          </label>
          <label className="text-sm font-medium">
            Argumenty / výhody (jeden riadok = jeden argument)
            <textarea
              name="benefits"
              rows={5}
              defaultValue={playbook.benefits}
              className="mt-1 w-full rounded-lg border border-border p-3"
              placeholder={"Úspora času pri objednávkach\nBez vstupného poplatku\nServis do 24 hodín"}
            />
          </label>
          <label className="text-sm font-medium">
            Otázky na zistenie záujmu (jeden riadok = jedna otázka)
            <textarea
              name="qualifyingQuestions"
              rows={4}
              defaultValue={playbook.qualifyingQuestions}
              className="mt-1 w-full rounded-lg border border-border p-3"
              placeholder={"Riešite to dnes interne, alebo cez dodávateľa?\nKedy naposledy ste to menili?"}
            />
          </label>
          <label className="text-sm font-medium">
            Cieľ hovoru
            <textarea
              name="callToAction"
              rows={3}
              defaultValue={playbook.callToAction}
              className="mt-1 w-full rounded-lg border border-border p-3"
              placeholder="Dohodnúť 15-minútový termín / poslať ponuku na e-mail / získať súhlas na ukážku."
            />
          </label>
        </section>

        <section className="grid gap-4 rounded-2xl border border-border bg-white p-5">
          <h2 className="font-semibold">Ako má argumentovať pri námietkach</h2>
          <p className="text-sm text-slate-500">
            Každý riadok je fakt, ktorý ChatGPT smie použiť. Keď zákazník povie niečo podobné, má
            ísť do pravej odpovede — nie mimo skript.
          </p>
          <ObjectionEditor initial={objections} />
          <label className="text-sm font-medium">
            Čo nesmie povedať
            <textarea
              name="neverDo"
              rows={3}
              defaultValue={playbook.neverDo}
              className="mt-1 w-full rounded-lg border border-border p-3"
              placeholder="Nesľubovať zľavy, nespomínať konkurenciu menom, netlačiť po treťom nie."
            />
          </label>
        </section>

        <button className="min-h-11 max-w-xs rounded-lg bg-primary px-4 font-semibold text-white">
          Uložiť skript pre ChatGPT
        </button>
      </form>

      <section className="grid gap-4 rounded-2xl border border-border bg-white p-5">
        <h2 className="font-semibold">Skúška argumentácie</h2>
        <p className="text-sm text-slate-500">
          ChatGPT dostane ten istý briefing ako pri živom hovore. Napíš námietku a uvidíš, či vie
          ísť do vašich faktov.
        </p>
        <RehearsalBox hasApiKey={Boolean(settings.openaiApiKey)} />
      </section>

      <section className="grid gap-3 rounded-2xl border border-border bg-white p-5">
        <h2 className="font-semibold">Čo ChatGPT reálne načíta</h2>
        <p className="text-sm text-slate-500">
          {filled
            ? "Tento text ide do Realtime instructions pri Volat aj pri kampani. Pri kontakte sa doplní meno, firma a poznámky z CRM."
            : "Zatiaľ je briefing prázdny. Vyplň a ulož polia vyššie."}
        </p>
        <pre className="max-h-[420px] overflow-auto rounded-xl bg-muted p-4 text-xs leading-relaxed whitespace-pre-wrap text-slate-700">
          {instructions}
        </pre>
      </section>
    </div>
  );
}

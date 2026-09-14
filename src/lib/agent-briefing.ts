import type { CallPlaybook, Campaign, Contact } from "@prisma/client";
import { prisma } from "./prisma";
import { getRuntimeConfig } from "./settings";

export type PlaybookObjection = {
  objection: string;
  reply: string;
};

export type ContactBrief = {
  firstName: string;
  lastName: string;
  phone: string;
  title?: string | null;
  city?: string | null;
  source?: string | null;
  websiteUrl?: string | null;
  companyName?: string | null;
  email?: string | null;
  notes: string[];
};

export function parseObjections(value: unknown): PlaybookObjection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const objection = String((row as PlaybookObjection).objection || "").trim();
      const reply = String((row as PlaybookObjection).reply || "").trim();
      if (!objection || !reply) return null;
      return { objection, reply };
    })
    .filter((row): row is PlaybookObjection => Boolean(row));
}

export async function ensurePlaybook() {
  return prisma.callPlaybook.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

function bulletList(raw: string, prefix = "- ") {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function section(title: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) return "";
  return `## ${title}\n${trimmed}`;
}

export function compileAgentInstructions(opts: {
  playbook: CallPlaybook;
  companyName: string;
  campaign?: Pick<Campaign, "name" | "scriptPrompt" | "description"> | null;
  contact?: ContactBrief | null;
}) {
  const { playbook, companyName } = opts;
  const objections = parseObjections(playbook.objections);
  const agent = playbook.agentName.trim() || "obchodný asistent";
  const parts: string[] = [
    `# Hlasový agent CallBot`,
    `Si živý predajný hlas na odchádzajúcom hovore. Hovoríš po slovensky, v mene firmy ${companyName}.`,
    `Predstavuješ sa ako: ${agent}.`,
    ``,
    `Tieto inštrukcie sú tvoj jediný zdroj pravdy. Argumentuj výhradne faktami nižšie. Ak fakt nemáš, povedz to na rovinu a ponúkni overenie / spätný hovor. Nič si nevymýšľaj — žiadne ceny, záruky, termíny ani produkty, ktoré tu nie sú.`,
  ];

  parts.push(
    section("Ako máš hovoriť", playbook.tone),
    section(
      "Úvod hovoru",
      playbook.openingLine
        ? `Prvú vetu povedz takto (môžeš ju prirodzene prispôsobiť menu kontaktu, obsah nemeň):\n„${playbook.openingLine.trim()}“`
        : "",
    ),
    section("Kto sme", playbook.companyAbout),
    section("Čo máme v ponuke", playbook.offer),
    section("Prečo áno / argumenty", bulletList(playbook.benefits)),
    section("Otázky na zistenie záujmu", bulletList(playbook.qualifyingQuestions)),
    section("Cieľ hovoru", playbook.callToAction),
  );

  if (objections.length) {
    parts.push(
      `## Námietky — takto argumentuj`,
      `Keď zákazník povie niečo blízke ľavému stĺpcu, použi pravú odpoveď vlastnými slovami. Drž sa faktov.`,
      ...objections.map((row, index) => `${index + 1}. Keď povie: „${row.objection}“\n   Odpovedz: ${row.reply}`),
    );
  }

  if (opts.campaign) {
    parts.push(
      section(
        "Táto kampaň",
        [`Názov: ${opts.campaign.name}`, opts.campaign.description || "", opts.campaign.scriptPrompt || ""]
          .filter(Boolean)
          .join("\n"),
      ),
    );
  }

  if (opts.contact) {
    const contactLines = [
      `Meno: ${opts.contact.firstName} ${opts.contact.lastName}`.trim(),
      opts.contact.companyName ? `Firma kontaktu: ${opts.contact.companyName}` : "",
      opts.contact.title ? `Pozícia: ${opts.contact.title}` : "",
      opts.contact.city ? `Mesto: ${opts.contact.city}` : "",
      opts.contact.phone ? `Telefón: ${opts.contact.phone}` : "",
      opts.contact.email
        ? `E-mail v CRM: ${opts.contact.email}`
        : "E-mail v CRM: zatiaľ nemáme. Ak ho dajú, zopakuj ho nahlas.",
      opts.contact.websiteUrl ? `Web: ${opts.contact.websiteUrl}` : "",
      opts.contact.source ? `Zdroj v CRM: ${opts.contact.source}` : "",
    ].filter(Boolean);
    const notes = opts.contact.notes.filter(Boolean).slice(0, 5);
    if (notes.length) {
      contactLines.push("Poznámky z CRM (použi ich, ak pomôžu argumentácii):");
      contactLines.push(...notes.map((note) => `- ${note}`));
    }
    parts.push(section("Komu voláš", contactLines.join("\n")));
  }

    parts.push(
    section("Nerob", playbook.neverDo),
    `## Pravidlá hovoru
- Najprv sa predstav, potom počúvaj.
- Jedna myšlienka naraz, krátke vety.
- Keď je záujem, ťahaj k cieľu hovoru.
- Ak je záujem alebo chce podklady, vždy si vypýtaj e-mail a zopakuj ho nahlas, aby sme ho vedeli zapísať.
- Pred ukončením zhrň: záujem áno/nie, ďalší krok, e-mail.
- Keď je to nie, poďakuj a ukonči. Nepridávaj nátlak.
- Ak ťa požiadajú, aby si ich už nevolal, sľúb to a ukonči.`,
  );

  return parts.filter(Boolean).join("\n\n").slice(0, 12000);
}

export async function loadContactBrief(contact: Contact): Promise<ContactBrief> {
  const [company, notes] = await Promise.all([
    contact.companyId
      ? prisma.company.findUnique({ where: { id: contact.companyId }, select: { name: true } })
      : Promise.resolve(null),
    prisma.note.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { body: true },
    }),
  ]);

  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
    title: contact.title,
    city: contact.city,
    source: contact.source,
    websiteUrl: contact.websiteUrl,
    companyName: company?.name ?? null,
    email: contact.email,
    notes: notes.map((note) => note.body.replace(/\s+/g, " ").trim().slice(0, 280)),
  };
}

export async function buildCallBriefing(opts: {
  contact?: Contact | null;
  campaign?: Pick<Campaign, "name" | "scriptPrompt" | "description"> | null;
}) {
  const [playbook, settings] = await Promise.all([ensurePlaybook(), getRuntimeConfig()]);
  const contact = opts.contact ? await loadContactBrief(opts.contact) : null;
  const instructions = compileAgentInstructions({
    playbook,
    companyName: settings.companyName,
    campaign: opts.campaign ?? null,
    contact,
  });
  return { playbook, settings, instructions };
}

"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { CallResultKind, ContactStatus, DealStage, UserRole, VoiceProviderKind } from "@prisma/client";
import { prisma } from "./prisma";
import { clearSession, hashPassword, loginWithPassword, requireAdmin, requireSession } from "./auth";
import { normalizeSkPhone } from "./phone";
import { getVoiceProvider } from "./voice";
import { pauseCampaign, resumeCampaign, startCampaign, stopCampaign } from "./dialer";
import { pauseHarvest, resumeHarvest, startHarvest, stopHarvest, ensureHarvestJob } from "./harvest";
import { buildCallBriefing, parseObjections } from "./agent-briefing";
import { rehearseWithChatGpt } from "./openai-agent";
import { applyCallDebrief } from "./call-debrief";
import { getRuntimeConfig } from "./settings";

const phoneSchema = z
  .string()
  .min(8, "Telefónne číslo je príliš krátke")
  .transform((value) => normalizeSkPhone(value) ?? "")
  .refine((value) => value.length > 0, "Zadaj slovenské číslo, napr. 0901 123 456");

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const user = await loginWithPassword(email, password);
  if (!user) {
    redirect("/login?error=1");
  }
  if (user.mustChangePassword) {
    redirect("/nastavenia?heslo=1");
  }
  redirect("/");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function createContactAction(formData: FormData) {
  const session = await requireSession();
  const parsed = z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      phone: phoneSchema,
      email: z.string().email().optional().or(z.literal("")),
      companyName: z.string().optional(),
      city: z.string().optional(),
      title: z.string().optional(),
      source: z.string().optional(),
      marketingConsent: z.boolean().optional(),
    })
    .parse({
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      phone: formData.get("phone"),
      email: formData.get("email") || "",
      companyName: formData.get("companyName") || "",
      city: formData.get("city") || "",
      title: formData.get("title") || "",
      source: formData.get("source") || "manuál",
      marketingConsent: formData.get("marketingConsent") === "on",
    });

  let companyId: string | undefined;
  if (parsed.companyName) {
    const existing = await prisma.company.findFirst({ where: { name: parsed.companyName } });
    const company =
      existing ?? (await prisma.company.create({ data: { name: parsed.companyName } }));
    companyId = company.id;
  }

  const contact = await prisma.contact.create({
    data: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      phone: parsed.phone,
      email: parsed.email || null,
      city: parsed.city || null,
      title: parsed.title || null,
      source: parsed.source,
      marketingConsent: parsed.marketingConsent ?? false,
      ownerId: session.id,
      companyId,
    },
  });

  await prisma.activity.create({
    data: {
      type: "SYSTEM",
      contactId: contact.id,
      userId: session.id,
      message: "Kontakt vytvorený",
    },
  });

  revalidatePath("/kontakty");
  redirect(`/kontakty/${contact.id}`);
}

export async function updateContactAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as ContactStatus;
  const nextFollowUpAt = String(formData.get("nextFollowUpAt") || "");
  const doNotCall = formData.get("doNotCall") === "on";

  await prisma.contact.update({
    where: { id },
    data: {
      firstName: String(formData.get("firstName") || ""),
      lastName: String(formData.get("lastName") || ""),
      phone: normalizeSkPhone(String(formData.get("phone") || "")) ?? String(formData.get("phone") || ""),
      email: String(formData.get("email") || "") || null,
      city: String(formData.get("city") || "") || null,
      title: String(formData.get("title") || "") || null,
      status,
      doNotCall,
      nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
    },
  });

  await prisma.activity.create({
    data: {
      type: "STATUS_CHANGE",
      contactId: id,
      userId: session.id,
      message: `Stav aktualizovaný na ${status}`,
    },
  });

  revalidatePath(`/kontakty/${id}`);
  revalidatePath("/kontakty");
}

export async function addNoteAction(formData: FormData) {
  const session = await requireSession();
  const contactId = String(formData.get("contactId"));
  const body = String(formData.get("body") || "").trim();
  if (!body) return;
  await prisma.note.create({
    data: { contactId, body, authorId: session.id },
  });
  await prisma.activity.create({
    data: {
      type: "NOTE",
      contactId,
      userId: session.id,
      message: "Pridaná poznámka",
    },
  });
  revalidatePath(`/kontakty/${contactId}`);
}

export async function addTaskAction(formData: FormData) {
  const session = await requireSession();
  const contactId = String(formData.get("contactId") || "") || null;
  const title = String(formData.get("title") || "").trim();
  const dueAt = String(formData.get("dueAt") || "");
  if (!title) return;
  await prisma.task.create({
    data: {
      title,
      description: String(formData.get("description") || "") || null,
      dueAt: dueAt ? new Date(dueAt) : null,
      contactId,
      ownerId: session.id,
    },
  });
  if (contactId) {
    await prisma.activity.create({
      data: {
        type: "TASK",
        contactId,
        userId: session.id,
        message: `Úloha: ${title}`,
      },
    });
  }
  revalidatePath("/ulohy");
  if (contactId) revalidatePath(`/kontakty/${contactId}`);
}

export async function completeTaskAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  await prisma.task.update({
    where: { id },
    data: { status: "DONE", completedAt: new Date() },
  });
  revalidatePath("/ulohy");
}

export async function placeCallAction(formData: FormData) {
  const session = await requireSession();
  const contactId = String(formData.get("contactId"));
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
  if (contact.doNotCall || contact.status === "DNC") {
    throw new Error("Tento kontakt je na zozname Nevolať");
  }

  const settings = await getRuntimeConfig();

  await prisma.contact.update({
    where: { id: contactId },
    data: { status: "CALLING", lastCalledAt: new Date() },
  });

  const briefing = await buildCallBriefing({ contact });
  const call = await prisma.call.create({
    data: {
      contactId,
      agentId: session.id,
      direction: "OUTBOUND",
      status: "RINGING",
      agentInstructions: briefing.instructions,
    },
  });

  const result = await getVoiceProvider(settings.voiceProvider).placeCall({
    to: contact.phone,
    from: settings.twilioFromNumber,
    contactId,
    contactName: `${contact.firstName} ${contact.lastName}`.trim(),
    contactEmail: contact.email,
    callId: call.id,
    instructions: briefing.instructions,
    twilioAccountSid: settings.twilioAccountSid,
    twilioAuthToken: settings.twilioAuthToken,
  });

  await applyCallDebrief({
    callId: call.id,
    contactId,
    contactName: `${contact.firstName} ${contact.lastName}`.trim(),
    result,
    transcript: result.transcript,
    agentId: session.id,
    recordingUrl: result.recordingUrl,
    recordingSid: result.recordingSid,
  });

  revalidatePath(`/kontakty/${contactId}`);
  revalidatePath("/kontakty");
  revalidatePath("/hovory");
  revalidatePath("/ulohy");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

export async function createCampaignAction(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const campaign = await prisma.campaign.create({
    data: {
      name,
      description: String(formData.get("description") || "") || null,
      scriptPrompt: String(formData.get("scriptPrompt") || "") || undefined,
      delayBetweenCallsMs: Number(formData.get("delayBetweenCallsMs") || 4000),
      retryAttempts: Number(formData.get("retryAttempts") || 2),
    },
  });
  revalidatePath("/kampane");
  redirect(`/kampane/${campaign.id}`);
}

export async function addContactsToCampaignAction(formData: FormData) {
  await requireSession();
  const campaignId = String(formData.get("campaignId"));
  const mode = String(formData.get("mode") || "new");
  const where =
    mode === "all"
      ? { doNotCall: false, status: { not: "DNC" as const } }
      : { doNotCall: false, status: "NEW" as const };

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const existing = await prisma.campaignMember.findMany({
    where: { campaignId },
    select: { contactId: true, queuePosition: true },
  });
  const existingIds = new Set(existing.map((m) => m.contactId));
  let position = existing.reduce((max, m) => Math.max(max, m.queuePosition), 0);

  const fresh = contacts.filter((c) => !existingIds.has(c.id));
  if (fresh.length) {
    await prisma.campaignMember.createMany({
      data: fresh.map((c) => {
        position += 1;
        return { campaignId, contactId: c.id, queuePosition: position };
      }),
    });
    await prisma.contact.updateMany({
      where: { id: { in: fresh.map((c) => c.id) }, status: "NEW" },
      data: { status: "QUEUED" },
    });
  }

  revalidatePath(`/kampane/${campaignId}`);
}

export async function startCampaignAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  await startCampaign(id);
  revalidatePath(`/kampane/${id}`);
  revalidatePath("/");
}

export async function pauseCampaignAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  await pauseCampaign(id);
  revalidatePath(`/kampane/${id}`);
  revalidatePath("/");
}

export async function resumeCampaignAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  await resumeCampaign(id);
  revalidatePath(`/kampane/${id}`);
  revalidatePath("/");
}

export async function stopCampaignAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  await stopCampaign(id);
  revalidatePath(`/kampane/${id}`);
  revalidatePath("/");
}

export async function updateDealStageAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  const stage = String(formData.get("stage")) as DealStage;
  await prisma.deal.update({ where: { id }, data: { stage } });
  revalidatePath("/pipeline");
}

export async function createDealAction(formData: FormData) {
  await requireSession();
  await prisma.deal.create({
    data: {
      title: String(formData.get("title") || "Nová príležitosť"),
      value: Number(formData.get("value") || 0),
      contactId: String(formData.get("contactId") || "") || null,
    },
  });
  revalidatePath("/pipeline");
}

export async function importContactsAction(formData: FormData) {
  const session = await requireSession();
  const csv = String(formData.get("csv") || "");
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return;

  const header = lines[0].toLowerCase();
  const hasHeader = header.includes("phone") || header.includes("telefon") || header.includes("meno");
  const rows = hasHeader ? lines.slice(1) : lines;
  let created = 0;

  for (const row of rows) {
    const cols = row.split(/[,;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const phone = normalizeSkPhone(cols.find((c) => /\d{8,}/.test(c)) || cols[2] || cols[0] || "");
    if (!phone) continue;
    const firstName = cols[0] && !/^\+?\d/.test(cols[0]) ? cols[0] : "Kontakt";
    const lastName = cols[1] && !/^\+?\d/.test(cols[1]) ? cols[1] : phone.slice(-4);
    try {
      await prisma.contact.create({
        data: {
          firstName,
          lastName,
          phone,
          source: "csv",
          ownerId: session.id,
        },
      });
      created += 1;
    } catch {
      // skip duplicates
    }
  }

  await prisma.activity.create({
    data: {
      type: "SYSTEM",
      userId: session.id,
      message: `CSV import: ${created} kontaktov`,
    },
  });
  revalidatePath("/kontakty");
}

export async function saveSettingsAction(formData: FormData) {
  await requireAdmin();
  const current = await prisma.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  const voiceProvider = String(formData.get("voiceProvider") || "STUB") as VoiceProviderKind;
  const twilioAccountSid = String(formData.get("twilioAccountSid") || "").trim();
  const twilioAuthToken = String(formData.get("twilioAuthToken") || "").trim();
  const openaiApiKey = String(formData.get("openaiApiKey") || "").trim();
  await prisma.appSettings.update({
    where: { id: "default" },
    data: {
      voiceProvider,
      twilioAccountSid: twilioAccountSid || current.twilioAccountSid,
      twilioAuthToken: twilioAuthToken || current.twilioAuthToken,
      twilioFromNumber: String(formData.get("twilioFromNumber") || "").trim() || current.twilioFromNumber,
      openaiApiKey: openaiApiKey || current.openaiApiKey,
      openaiRealtimeModel: String(formData.get("openaiRealtimeModel") || current.openaiRealtimeModel),
      companyName: String(formData.get("companyName") || "CallBot"),
      mailFrom: String(formData.get("mailFrom") || "").trim() || null,
    },
  });
  revalidatePath("/nastavenia");
}

export async function changePasswordAction(formData: FormData) {
  const session = await requireSession();
  const currentPassword = String(formData.get("currentPassword") || "");
  const nextPassword = String(formData.get("newPassword") || "");
  if (nextPassword.length < 10) {
    redirect("/nastavenia?heslo=kratke");
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    redirect("/nastavenia?heslo=zle");
  }
  await prisma.user.update({
    where: { id: session.id },
    data: {
      passwordHash: await hashPassword(nextPassword),
      mustChangePassword: false,
    },
  });
  (await cookies()).delete("cb_force_password");
  revalidatePath("/nastavenia");
  redirect("/nastavenia?heslo=ok");
}

export async function createUserAction(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "AGENT") === "ADMIN" ? UserRole.ADMIN : UserRole.AGENT;
  if (!email || !name || password.length < 10) {
    redirect("/nastavenia?ucet=chyba");
  }
  try {
    await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await hashPassword(password),
        role,
        mustChangePassword: true,
      },
    });
  } catch {
    redirect("/nastavenia?ucet=chyba");
  }
  revalidatePath("/nastavenia");
  redirect("/nastavenia?ucet=ok");
}

export async function overrideCallResultAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") || "");
  const resultKind = String(formData.get("resultKind") || "") as CallResultKind;
  if (resultKind !== "SUCCESS" && resultKind !== "FAILURE") return;
  const call = await prisma.call.findUnique({ where: { id }, include: { contact: true } });
  if (!call) return;
  const note = String(formData.get("note") || "").trim();
  await prisma.call.update({
    where: { id },
    data: {
      resultKind,
      resultOverridden: true,
      outcome: resultKind === "SUCCESS" ? call.outcome || "callback" : call.outcome || "not_interested",
    },
  });
  await prisma.contact.update({
    where: { id: call.contactId },
    data: {
      status: resultKind === "SUCCESS" ? "CALLBACK" : call.contact.status === "DNC" ? "DNC" : "NOT_INTERESTED",
    },
  });
  if (note) {
    await prisma.note.create({
      data: {
        contactId: call.contactId,
        authorId: session.id,
        body: `Ručná oprava výsledku na ${resultKind === "SUCCESS" ? "úspešný" : "neúspešný"}: ${note}`,
      },
    });
  }
  await prisma.activity.create({
    data: {
      type: "CALL",
      contactId: call.contactId,
      userId: session.id,
      message: `Výsledok hovoru opravený na ${resultKind === "SUCCESS" ? "úspešný" : "neúspešný"}`,
      payload: { callId: id, resultKind },
    },
  });
  revalidatePath("/hovory");
  revalidatePath(`/kontakty/${call.contactId}`);
}

export async function startHarvestAction(formData: FormData) {
  await requireAdmin();
  if (formData.get("legal") !== "on") {
    redirect("/zber?chyba=suhlas");
  }
  await prisma.harvestJob.upsert({
    where: { id: "default" },
    update: { legalAcknowledgedAt: new Date() },
    create: { id: "default", legalAcknowledgedAt: new Date() },
  });
  await startHarvest();
  revalidatePath("/zber");
  revalidatePath("/");
}

export async function pauseHarvestAction() {
  await requireAdmin();
  await pauseHarvest();
  revalidatePath("/zber");
  revalidatePath("/");
}

export async function resumeHarvestAction() {
  await requireAdmin();
  await resumeHarvest();
  revalidatePath("/zber");
  revalidatePath("/");
}

export async function stopHarvestAction() {
  await requireAdmin();
  await stopHarvest();
  revalidatePath("/zber");
  revalidatePath("/");
}

export async function saveHarvestSettingsAction(formData: FormData) {
  await requireAdmin();
  await ensureHarvestJob();
  const queries = String(formData.get("queries") || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sources = formData
    .getAll("sources")
    .map((value) => String(value))
    .filter((value) => value === "zoznam" || value === "azet");
  await prisma.harvestJob.update({
    where: { id: "default" },
    data: {
      maxLoadMs: Math.max(800, Number(formData.get("maxLoadMs") || 2000)),
      minScore: Math.max(8, Number(formData.get("minScore") || 10)),
      delayMs: Math.max(1500, Number(formData.get("delayMs") || 3500)),
      targetNewContacts: Math.max(1, Number(formData.get("targetNewContacts") || 400)),
      attachToCampaign: formData.get("attachToCampaign") === "on",
      sources: sources.length ? sources : ["zoznam", "azet"],
      queries,
    },
  });
  revalidatePath("/zber");
}

export async function savePlaybookAction(formData: FormData) {
  await requireAdmin();
  let objections = parseObjections([]);
  try {
    objections = parseObjections(JSON.parse(String(formData.get("objections") || "[]")));
  } catch {
    objections = [];
  }
  await prisma.callPlaybook.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  await prisma.callPlaybook.update({
    where: { id: "default" },
    data: {
      agentName: String(formData.get("agentName") || "").trim().slice(0, 120),
      companyAbout: String(formData.get("companyAbout") || "").trim().slice(0, 4000),
      offer: String(formData.get("offer") || "").trim().slice(0, 4000),
      benefits: String(formData.get("benefits") || "").trim().slice(0, 4000),
      openingLine: String(formData.get("openingLine") || "").trim().slice(0, 800),
      qualifyingQuestions: String(formData.get("qualifyingQuestions") || "").trim().slice(0, 2000),
      callToAction: String(formData.get("callToAction") || "").trim().slice(0, 1500),
      neverDo: String(formData.get("neverDo") || "").trim().slice(0, 2000),
      tone: String(formData.get("tone") || "").trim().slice(0, 800),
      objections,
    },
  });
  const companyName = String(formData.get("companyName") || "").trim();
  if (companyName) {
    await prisma.appSettings.upsert({
      where: { id: "default" },
      update: { companyName: companyName.slice(0, 120) },
      create: { id: "default", companyName: companyName.slice(0, 120) },
    });
  }
  revalidatePath("/skript");
}

export type RehearseState = {
  reply: string;
  error: string;
};

export async function rehearsePlaybookAction(
  _prev: RehearseState,
  formData: FormData,
): Promise<RehearseState> {
  await requireSession();
  const customerLine = String(formData.get("customerLine") || "").trim();
  if (!customerLine) {
    return { reply: "", error: "Napíš, čo zákazník povedal." };
  }
  const briefing = await buildCallBriefing({});
  if (!briefing.playbook.offer && !briefing.playbook.companyAbout && !briefing.playbook.openingLine) {
    return { reply: "", error: "Najprv ulož skript — firma, ponuka alebo úvod sú prázdne." };
  }
  if (!briefing.settings.openaiApiKey) {
    return { reply: "", error: "V Nastaveniach chýba OpenAI kľúč. Bez neho ChatGPT skript nevie načítať." };
  }
  const result = await rehearseWithChatGpt({
    apiKey: briefing.settings.openaiApiKey,
    instructions: briefing.instructions,
    customerLine,
  });
  if (!result.ok) {
    return { reply: "", error: result.error };
  }
  return { reply: result.reply, error: "" };
}

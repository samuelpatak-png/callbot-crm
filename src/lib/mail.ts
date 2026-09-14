import { prisma } from "./prisma";
import { getRuntimeConfig } from "./settings";
import { normalizeEmail } from "./call-capture";

function materialsBody(opts: { companyName: string; contactName: string; offer: string }) {
  const offer = opts.offer.trim() || "Krátke predstavenie odchádzajúcich hovorov CallBot.";
  return `Dobrý deň, ${opts.contactName},

ďakujeme za hovor. Ako sme povedali, posielame stručné podklady od ${opts.companyName}.

${offer}

Ak to teraz nie je aktuálne, stačí odpísať a nebudeme volať znova.

CallBot`;
}

export async function queueMaterialsEmail(opts: {
  contactId: string;
  callId?: string | null;
  toEmail: string | null;
  contactName: string;
}) {
  const email = normalizeEmail(opts.toEmail);
  if (!email) return null;

  const existing = opts.callId
    ? await prisma.mailMessage.findFirst({ where: { callId: opts.callId, toEmail: email } })
    : null;
  if (existing) return existing;

  const [config, playbook, contact] = await Promise.all([
    getRuntimeConfig(),
    prisma.callPlaybook.findUnique({ where: { id: "default" } }),
    prisma.contact.findUnique({ where: { id: opts.contactId } }),
  ]);

  const row = await prisma.mailMessage.create({
    data: {
      contactId: opts.contactId,
      callId: opts.callId || null,
      toEmail: email,
      subject: `Podklady po hovore — ${config.companyName}`,
      body: materialsBody({
        companyName: config.companyName,
        contactName: opts.contactName || contact?.firstName || "kontakt",
        offer: playbook?.offer || playbook?.companyAbout || "",
      }),
      status: "PENDING",
    },
  });

  return sendMailMessage(row.id);
}

export async function sendMailMessage(id: string) {
  const message = await prisma.mailMessage.findUnique({ where: { id } });
  if (!message || message.status === "SENT") return message;

  const config = await getRuntimeConfig();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    await prisma.mailMessage.update({
      where: { id },
      data: {
        status: "PENDING",
        error: "Chýba RESEND_API_KEY. Podklady ostávajú v poradí a v úlohe.",
        provider: "resend",
      },
    });
    return prisma.mailMessage.findUnique({ where: { id } });
  }

  const from = config.mailFrom || "CallBot <noreply@callbot.local>";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.toEmail],
        subject: message.subject,
        text: message.body,
      }),
    });
    const raw = await response.text();
    if (!response.ok) {
      await prisma.mailMessage.update({
        where: { id },
        data: { status: "FAILED", error: raw.slice(0, 400), provider: "resend" },
      });
      return prisma.mailMessage.findUnique({ where: { id } });
    }
    return prisma.mailMessage.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), error: null, provider: "resend" },
    });
  } catch (error) {
    await prisma.mailMessage.update({
      where: { id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message.slice(0, 400) : "odoslanie zlyhalo",
        provider: "resend",
      },
    });
    return prisma.mailMessage.findUnique({ where: { id } });
  }
}

export async function flushPendingMail() {
  const pending = await prisma.mailMessage.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  for (const item of pending) {
    await sendMailMessage(item.id);
  }
  return pending.length;
}

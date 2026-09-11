import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.INITIAL_ADMIN_EMAIL || "admin@callbot.local").toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || "CallBot2026!";
  const name = process.env.INITIAL_ADMIN_NAME || "Admin";

  const admin = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });

  await prisma.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      companyName: "CallBot",
      voiceProvider: "STUB",
    },
  });

  const companyA = await prisma.company.upsert({
    where: { id: "seed-company-a" },
    update: {},
    create: { id: "seed-company-a", name: "Nordic Logistics SK", industry: "Logistika", website: "https://example.com" },
  });
  const companyB = await prisma.company.upsert({
    where: { id: "seed-company-b" },
    update: {},
    create: { id: "seed-company-b", name: "Tatra Clinic", industry: "Zdravotníctvo" },
  });

  const tags = await Promise.all(
    [
      { name: "hot", color: "#DC2626" },
      { name: "callback", color: "#2563EB" },
      { name: "demo", color: "#059669" },
    ].map((tag) =>
      prisma.tag.upsert({
        where: { name: tag.name },
        update: tag,
        create: tag,
      }),
    ),
  );

  const people = [
    { firstName: "Martin", lastName: "Kováč", phone: "+421901100001", city: "Bratislava", companyId: companyA.id, title: "Konateľ" },
    { firstName: "Jana", lastName: "Horváthová", phone: "+421901100002", city: "Košice", companyId: companyB.id, title: "Nákup" },
    { firstName: "Peter", lastName: "Nagy", phone: "+421901100003", city: "Žilina", companyId: companyA.id, title: "Obchod" },
    { firstName: "Lucia", lastName: "Szabóová", phone: "+421901100004", city: "Nitra", title: "Asistentka" },
    { firstName: "Tomáš", lastName: "Varga", phone: "+421901100005", city: "Trnava", companyId: companyA.id, title: "Dispečer" },
    { firstName: "Eva", lastName: "Balážová", phone: "+421901100006", city: "Prešov", companyId: companyB.id, title: "Riaditeľka" },
    { firstName: "Michal", lastName: "Tóth", phone: "+421901100007", city: "Banská Bystrica", title: "IT" },
    { firstName: "Zuzana", lastName: "Krajčíová", phone: "+421901100008", city: "Trenčín", companyId: companyA.id, title: "HR" },
    { firstName: "Andrej", lastName: "Molnár", phone: "+421901100009", city: "Poprad", title: "Majiteľ" },
    { firstName: "Katarína", lastName: "Lukáčová", phone: "+421901100010", city: "Martin", companyId: companyB.id, title: "Recepcia" },
  ];

  const contacts: { id: string }[] = [];
  for (const person of people) {
    const contact = await prisma.contact.upsert({
      where: { phone: person.phone },
      update: person,
      create: {
        ...person,
        email: `${person.firstName.toLowerCase()}.${person.lastName.toLowerCase()}@example.sk`,
        source: "seed",
        ownerId: admin.id,
        nextFollowUpAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * (contacts.length + 1)),
      },
    });
    contacts.push(contact);
  }

  await prisma.contactTag.createMany({
    data: [
      { contactId: contacts[0].id, tagId: tags[0].id },
      { contactId: contacts[1].id, tagId: tags[1].id },
      { contactId: contacts[5].id, tagId: tags[2].id },
    ],
    skipDuplicates: true,
  });

  await prisma.note.createMany({
    data: [
      { contactId: contacts[0].id, authorId: admin.id, body: "Chce cenník na Q4. Voláť po 14:00." },
      { contactId: contacts[1].id, authorId: admin.id, body: "Zanechaný odkaz, spätné volanie v utorok." },
      { contactId: contacts[5].id, authorId: admin.id, body: "Záujem o demo CallBot pre recepciu." },
    ],
  });

  await prisma.task.createMany({
    data: [
      { title: "Poslať cenník Nordic Logistics", contactId: contacts[0].id, ownerId: admin.id, dueAt: new Date(Date.now() + 86400000) },
      { title: "Spätné volanie Tatra Clinic", contactId: contacts[1].id, ownerId: admin.id, dueAt: new Date(Date.now() + 172800000) },
      { title: "Pripraviť AI skript pre demo", ownerId: admin.id, dueAt: new Date(Date.now() + 259200000) },
    ],
  });

  await prisma.deal.createMany({
    data: [
      { title: "Nordic — outbound licencie", value: 4800, stage: "QUALIFIED", contactId: contacts[0].id, companyId: companyA.id },
      { title: "Tatra Clinic — recepčný bot", value: 7200, stage: "PROPOSAL", contactId: contacts[5].id, companyId: companyB.id },
      { title: "Molnár — malý balík", value: 900, stage: "LEAD", contactId: contacts[8].id },
    ],
  });

  const campaign = await prisma.campaign.upsert({
    where: { id: "seed-campaign-1" },
    update: {},
    create: {
      id: "seed-campaign-1",
      name: "Aprílový outbound — SK čísla",
      description: "Automatické volanie demo kontaktov. Pripravené na Twilio + ChatGPT Realtime.",
      scriptPrompt: "Predstav sa ako CallBot, over záujem o automatizované volania a dohodni termín.",
      delayBetweenCallsMs: 4000,
      retryAttempts: 2,
    },
  });

  await prisma.campaignMember.createMany({
    data: contacts.slice(0, 6).map((contact, index) => ({
      campaignId: campaign.id,
      contactId: contact.id,
      queuePosition: index + 1,
    })),
    skipDuplicates: true,
  });

  await prisma.activity.create({
    data: {
      type: "SYSTEM",
      userId: admin.id,
      message: "CRM naplnené ukážkovými dátami",
    },
  });

  console.log(`Seed hotový. Prihlásenie: ${email} / ${password}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

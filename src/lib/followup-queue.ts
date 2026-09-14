import { prisma } from "./prisma";

export async function requeueDueFollowUps() {
  const due = await prisma.contact.findMany({
    where: {
      nextFollowUpAt: { lte: new Date() },
      doNotCall: false,
      status: { notIn: ["DNC", "NOT_INTERESTED", "CALLING"] },
    },
    take: 25,
    orderBy: { nextFollowUpAt: "asc" },
  });
  if (!due.length) return { queued: 0 };

  let campaign = await prisma.campaign.findFirst({
    where: { status: "RUNNING" },
    orderBy: { updatedAt: "desc" },
  });
  if (!campaign) {
    campaign =
      (await prisma.campaign.findFirst({ where: { name: "Spätné volania" } })) ??
      (await prisma.campaign.create({
        data: {
          name: "Spätné volania",
          description: "Kontakty s dohodnutým termínom alebo nezdvihnutým hovorom.",
          status: "DRAFT",
        },
      }));
  }

  const last = await prisma.campaignMember.findFirst({
    where: { campaignId: campaign.id },
    orderBy: { queuePosition: "asc" },
    select: { queuePosition: true },
  });
  let position = Math.min(last?.queuePosition ?? 1, 1);
  let queued = 0;

  for (const contact of due) {
    const member = await prisma.campaignMember.findUnique({
      where: { campaignId_contactId: { campaignId: campaign.id, contactId: contact.id } },
    });
    if (member?.status === "PENDING" || member?.status === "IN_PROGRESS") {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { nextFollowUpAt: null },
      });
      continue;
    }
    position -= 1;
    if (member) {
      await prisma.campaignMember.update({
        where: { id: member.id },
        data: { status: "PENDING", queuePosition: position },
      });
    } else {
      await prisma.campaignMember.create({
        data: {
          campaignId: campaign.id,
          contactId: contact.id,
          queuePosition: position,
          status: "PENDING",
        },
      });
    }
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        nextFollowUpAt: null,
        status: contact.status === "NEW" ? "QUEUED" : contact.status,
      },
    });
    queued += 1;
  }

  return { queued, campaignId: campaign.id };
}

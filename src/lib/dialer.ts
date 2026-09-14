import { after } from "next/server";
import { prisma } from "./prisma";
import { appUrl } from "./utils";
import { getVoiceProvider } from "./voice";
import { cronSecret } from "./cron-auth";
import { buildCallBriefing } from "./agent-briefing";
import { loadPlaybookIntoRealtime } from "./openai-agent";
import { applyCallDebrief } from "./call-debrief";

function inWorkingHours(start: string, end: string, timeZone: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const current = `${hour}:${minute}`;
  return current >= start && current <= end;
}

async function scheduleNextTick(delayMs: number) {
  const secret = cronSecret();
  if (!secret) return;
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 8000)));
    await fetch(`${appUrl()}/api/dialer/tick`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source: "chain" }),
    }).catch(() => undefined);
  });
}

export async function tickDialer() {
  const settings = await prisma.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  const campaign = await prisma.campaign.findFirst({
    where: { status: "RUNNING" },
    orderBy: { updatedAt: "asc" },
  });

  if (!campaign) {
    return { ok: true, processed: 0, reason: "no_running_campaign" };
  }

  if (!inWorkingHours(campaign.workingHoursStart, campaign.workingHoursEnd, campaign.timezone)) {
    await scheduleNextTick(60_000);
    return { ok: true, processed: 0, reason: "outside_working_hours", campaignId: campaign.id };
  }

  const member = await prisma.campaignMember.findFirst({
    where: { campaignId: campaign.id, status: "PENDING" },
    orderBy: { queuePosition: "asc" },
    include: { contact: true },
  });

  if (!member) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return { ok: true, processed: 0, reason: "queue_empty", campaignId: campaign.id };
  }

  if (member.contact.doNotCall || member.contact.status === "DNC") {
    await prisma.campaignMember.update({
      where: { id: member.id },
      data: { status: "SKIPPED" },
    });
    await scheduleNextTick(campaign.delayBetweenCallsMs);
    return { ok: true, processed: 1, skipped: true, campaignId: campaign.id };
  }

  await prisma.$transaction([
    prisma.campaignMember.update({
      where: { id: member.id },
      data: { status: "IN_PROGRESS", lastAttemptAt: new Date(), attempts: { increment: 1 } },
    }),
    prisma.contact.update({
      where: { id: member.contactId },
      data: { status: "CALLING", lastCalledAt: new Date() },
    }),
  ]);

  const provider = getVoiceProvider(settings.voiceProvider);
  const briefing = await buildCallBriefing({ contact: member.contact, campaign });
  const realtime = await loadPlaybookIntoRealtime(briefing.settings, briefing.instructions);

  const call = await prisma.call.create({
    data: {
      contactId: member.contactId,
      campaignId: campaign.id,
      direction: "OUTBOUND",
      status: "RINGING",
      agentInstructions: briefing.instructions,
      realtimeSessionId: realtime.sessionId,
    },
  });

  const result = await provider.placeCall({
    to: member.contact.phone,
    from: settings.twilioFromNumber,
    contactId: member.contactId,
    contactName: `${member.contact.firstName} ${member.contact.lastName}`.trim(),
    contactEmail: member.contact.email,
    campaignId: campaign.id,
    callId: call.id,
    scriptPrompt: campaign.scriptPrompt,
    instructions: briefing.instructions,
    twilioAccountSid: settings.twilioAccountSid,
    twilioAuthToken: settings.twilioAuthToken,
  });

  if (result.status === "RINGING") {
    await applyCallDebrief({
      callId: call.id,
      contactId: member.contactId,
      contactName: `${member.contact.firstName} ${member.contact.lastName}`.trim(),
      result,
      transcript: result.transcript,
      campaignId: campaign.id,
      realtimeLoaded: realtime.loaded,
      recordingUrl: result.recordingUrl,
      recordingSid: result.recordingSid,
    });
    return { ok: true, processed: 1, campaignId: campaign.id, waiting: "twilio" };
  }

  await applyCallDebrief({
    callId: call.id,
    contactId: member.contactId,
    contactName: `${member.contact.firstName} ${member.contact.lastName}`.trim(),
    result,
    transcript: result.transcript,
    campaignId: campaign.id,
    realtimeLoaded: realtime.loaded,
    recordingUrl: result.recordingUrl,
    recordingSid: result.recordingSid,
  });

  await finalizeCampaignMember({
    campaignId: campaign.id,
    contactId: member.contactId,
    callStatus: result.status,
  });

  return { ok: true, processed: 1, campaignId: campaign.id };
}

export async function finalizeCampaignMember(opts: {
  campaignId: string | null | undefined;
  contactId: string;
  callStatus: import("@prisma/client").CallStatus;
}) {
  if (!opts.campaignId) return;
  const campaign = await prisma.campaign.findUnique({ where: { id: opts.campaignId } });
  if (!campaign) return;

  const member = await prisma.campaignMember.findUnique({
    where: { campaignId_contactId: { campaignId: opts.campaignId, contactId: opts.contactId } },
  });
  if (!member || member.status === "COMPLETED" || member.status === "SKIPPED") return;

  const retry =
    member.attempts < campaign.retryAttempts && ["NO_ANSWER", "BUSY", "FAILED"].includes(opts.callStatus);

  await prisma.campaignMember.update({
    where: { id: member.id },
    data: { status: retry ? "PENDING" : opts.callStatus === "FAILED" ? "FAILED" : "COMPLETED" },
  });

  const remaining = await prisma.campaignMember.count({
    where: { campaignId: campaign.id, status: "PENDING" },
  });
  if (remaining === 0 && campaign.status === "RUNNING") {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  } else if (campaign.status === "RUNNING") {
    await scheduleNextTick(campaign.delayBetweenCallsMs);
  }
}

export async function startCampaign(id: string) {
  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status: "RUNNING", startedAt: new Date(), pausedAt: null, stoppedAt: null },
  });
  await prisma.activity.create({
    data: {
      type: "CAMPAIGN",
      message: `Kampaň „${campaign.name}“ spustená`,
      payload: { campaignId: id },
    },
  });
  await tickDialer();
  return campaign;
}

export async function pauseCampaign(id: string) {
  return prisma.campaign.update({
    where: { id },
    data: { status: "PAUSED", pausedAt: new Date() },
  });
}

export async function stopCampaign(id: string) {
  return prisma.campaign.update({
    where: { id },
    data: { status: "STOPPED", stoppedAt: new Date() },
  });
}

export async function resumeCampaign(id: string) {
  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status: "RUNNING", pausedAt: null },
  });
  await tickDialer();
  return campaign;
}

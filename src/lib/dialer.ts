import { after } from "next/server";
import type { CallStatus, ContactStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { appUrl } from "./utils";
import { getVoiceProvider } from "./voice";
import { cronSecret } from "./cron-auth";
import { buildCallBriefing } from "./agent-briefing";
import { loadPlaybookIntoRealtime } from "./openai-agent";

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

function contactStatusFromOutcome(outcome: string, callStatus: CallStatus): ContactStatus {
  if (outcome === "interested") return "INTERESTED";
  if (outcome === "connected") return "CONNECTED";
  if (callStatus === "NO_ANSWER") return "NO_ANSWER";
  if (callStatus === "VOICEMAIL") return "VOICEMAIL";
  if (callStatus === "BUSY") return "CALLBACK";
  if (callStatus === "FAILED") return "FAILED";
  return "CONNECTED";
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
    campaignId: campaign.id,
    callId: call.id,
    scriptPrompt: campaign.scriptPrompt,
    instructions: briefing.instructions,
    twilioAccountSid: settings.twilioAccountSid,
    twilioAuthToken: settings.twilioAuthToken,
  });

  const nextStatus = contactStatusFromOutcome(result.outcome, result.status);
  const retry = member.attempts + 1 < campaign.retryAttempts && ["NO_ANSWER", "BUSY", "FAILED"].includes(result.status);

  await prisma.$transaction([
    prisma.call.update({
      where: { id: call.id },
      data: {
        status: result.status,
        outcome: result.outcome,
        durationSec: result.durationSec,
        endedAt: new Date(),
        provider: result.provider,
        providerCallSid: result.providerCallSid,
        transcript: result.transcript,
        summary: realtime.loaded
          ? `${result.summary} ChatGPT Realtime má načítaný skript.`
          : result.summary,
      },
    }),
    prisma.contact.update({
      where: { id: member.contactId },
      data: {
        status: nextStatus,
        lastCalledAt: new Date(),
        nextFollowUpAt:
          nextStatus === "CALLBACK" || nextStatus === "NO_ANSWER"
            ? new Date(Date.now() + 1000 * 60 * 60 * 24)
            : undefined,
      },
    }),
    prisma.campaignMember.update({
      where: { id: member.id },
      data: { status: retry ? "PENDING" : result.status === "FAILED" ? "FAILED" : "COMPLETED" },
    }),
    prisma.activity.create({
      data: {
        type: "CALL",
        contactId: member.contactId,
        message: `Automatický hovor: ${result.outcome} (${result.provider})`,
        payload: { campaignId: campaign.id, sid: result.providerCallSid },
      },
    }),
  ]);

  const remaining = await prisma.campaignMember.count({
    where: { campaignId: campaign.id, status: "PENDING" },
  });
  if (remaining === 0) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  } else {
    await scheduleNextTick(campaign.delayBetweenCallsMs);
  }

  return { ok: true, processed: 1, campaignId: campaign.id, remaining };
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

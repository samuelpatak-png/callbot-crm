import { NextResponse } from "next/server";
import type { CallDirection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isBridgeAuthorized } from "@/lib/cron-auth";
import { buildCallBriefing } from "@/lib/agent-briefing";
import { loadPlaybookIntoRealtime } from "@/lib/openai-agent";
import { getRuntimeConfig } from "@/lib/settings";
import { normalizeZadarmaPhone } from "@/lib/zadarma";
import type { BridgeContextRequest, BridgeContextResponse } from "@/lib/bridge-protocol";

export const maxDuration = 30;

export async function POST(request: Request) {
  if (!isBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as BridgeContextRequest;
  const config = await getRuntimeConfig();
  const direction: CallDirection = body.direction === "inbound" ? "INBOUND" : "OUTBOUND";

  let call = body.callId
    ? await prisma.call.findUnique({
        where: { id: body.callId },
        include: { contact: true, campaign: true },
      })
    : null;

  if (!call && body.providerCallSid) {
    call = await prisma.call.findFirst({
      where: { providerCallSid: body.providerCallSid },
      include: { contact: true, campaign: true },
      orderBy: { startedAt: "desc" },
    });
  }

  if (!call && direction === "INBOUND") {
    const phone = normalizeZadarmaPhone(body.from);
    if (!phone) {
      return NextResponse.json({ error: "Chýba číslo volajúceho" }, { status: 400 });
    }
    const contact =
      (await prisma.contact.findUnique({ where: { phone } })) ??
      (await prisma.contact.create({
        data: {
          firstName: "Volajúci",
          lastName: phone.slice(-4),
          phone,
          source: "zadarma-inbound",
          status: "CALLING",
          lastCalledAt: new Date(),
        },
      }));
    call = await prisma.call.create({
      data: {
        contactId: contact.id,
        direction: "INBOUND",
        status: "IN_PROGRESS",
        provider: "ZADARMA_REALTIME",
        providerCallSid: body.providerCallSid || null,
      },
      include: { contact: true, campaign: true },
    });
  }

  if (!call) {
    return NextResponse.json({ error: "Hovor sa nenašiel" }, { status: 404 });
  }

  const briefing = call.agentInstructions
    ? { instructions: call.agentInstructions }
    : await buildCallBriefing({ contact: call.contact, campaign: call.campaign });

  const realtime = await loadPlaybookIntoRealtime(
    {
      openaiApiKey: config.openaiApiKey,
      openaiRealtimeModel: config.openaiRealtimeModel,
      openaiRealtimeVoice: config.openaiRealtimeVoice,
    },
    briefing.instructions,
  );

  await prisma.call.update({
    where: { id: call.id },
    data: {
      agentInstructions: briefing.instructions,
      realtimeSessionId: realtime.sessionId || call.realtimeSessionId,
      provider: "ZADARMA_REALTIME",
      providerCallSid: body.providerCallSid || call.providerCallSid,
      status: call.status === "QUEUED" || call.status === "RINGING" ? "IN_PROGRESS" : call.status,
    },
  });

  const payload: BridgeContextResponse = {
    callId: call.id,
    contactId: call.contactId,
    contactName: `${call.contact.firstName} ${call.contact.lastName}`.trim(),
    instructions: briefing.instructions,
    model: realtime.model,
    voice: realtime.voice,
    sessionId: realtime.sessionId,
    clientSecret: realtime.clientSecret,
  };
  return NextResponse.json(payload);
}

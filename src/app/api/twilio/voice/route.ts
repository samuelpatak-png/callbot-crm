import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertTwilioSignature, parseTwilioForm, twilioUnauthorized } from "@/lib/twilio-signature";
import { openingTwiml, hangupTwiml } from "@/lib/twilio-conversation";

export const maxDuration = 30;

async function handle(request: Request) {
  const params = await parseTwilioForm(request);
  try {
    await assertTwilioSignature(request, params);
  } catch {
    return twilioUnauthorized();
  }

  const callId = new URL(request.url).searchParams.get("callId") || params.CallSid || "";
  const call = callId
    ? await prisma.call.findFirst({
        where: callId.startsWith("CA") ? { providerCallSid: callId } : { id: callId },
        select: { id: true },
      })
    : params.CallSid
      ? await prisma.call.findFirst({ where: { providerCallSid: params.CallSid }, select: { id: true } })
      : null;

  if (!call) {
    return hangupTwiml("Ospravedlňujem sa, hovor sa nepodarilo spárovať. Pekný deň.");
  }

  if (params.CallSid) {
    await prisma.call.update({
      where: { id: call.id },
      data: { providerCallSid: params.CallSid, status: "IN_PROGRESS" },
    });
  }

  return openingTwiml(call.id);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

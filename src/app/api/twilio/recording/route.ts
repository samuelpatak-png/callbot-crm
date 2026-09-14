import { NextResponse } from "next/server";
import { ingestTwilioRecording } from "@/lib/twilio-ingest";
import { assertTwilioSignature, parseTwilioForm, twilioUnauthorized } from "@/lib/twilio-signature";

export const maxDuration = 30;

async function handle(request: Request) {
  const params = await parseTwilioForm(request);
  try {
    await assertTwilioSignature(request, params);
  } catch {
    return twilioUnauthorized();
  }
  const form = new FormData();
  new URL(request.url).searchParams.forEach((value, key) => form.append(key, value));
  Object.entries(params).forEach(([key, value]) => form.set(key, value));
  const callId = new URL(request.url).searchParams.get("callId");
  const result = await ingestTwilioRecording(form, callId);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

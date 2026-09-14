import { NextResponse } from "next/server";
import { ingestTwilioRecording } from "@/lib/twilio-ingest";

export const maxDuration = 30;

async function payload(request: Request) {
  if (request.method === "POST") {
    try {
      return await request.formData();
    } catch {
      return new FormData();
    }
  }
  const form = new FormData();
  new URL(request.url).searchParams.forEach((value, key) => form.append(key, value));
  return form;
}

async function handle(request: Request) {
  const callId = new URL(request.url).searchParams.get("callId");
  const result = await ingestTwilioRecording(await payload(request), callId);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

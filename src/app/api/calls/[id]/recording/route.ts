import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getRuntimeConfig } from "@/lib/settings";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Prihláste sa" }, { status: 401 });
  }
  const { id } = await context.params;
  const call = await prisma.call.findUnique({
    where: { id },
    select: {
      recordingUrl: true,
      transcript: true,
      provider: true,
    },
  });
  if (!call) {
    return NextResponse.json({ error: "Hovor sa nenašiel" }, { status: 404 });
  }

  const remote = call.recordingUrl?.startsWith("http") ? call.recordingUrl : null;
  if (remote) {
    const config = await getRuntimeConfig();
    const headers: HeadersInit = {};
    if (config.twilioAccountSid && config.twilioAuthToken && remote.includes("twilio.com")) {
      headers.Authorization = `Basic ${Buffer.from(
        `${config.twilioAccountSid}:${config.twilioAuthToken}`,
      ).toString("base64")}`;
    }
    const audio = await fetch(remote, { headers });
    if (!audio.ok) {
      return NextResponse.json({ error: "Nahrávku sa nepodarilo stiahnuť" }, { status: 502 });
    }
    return new NextResponse(audio.body, {
      headers: {
        "Content-Type": audio.headers.get("content-type") || "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const transcript = call.transcript?.trim();
  const config = await getRuntimeConfig();
  if (transcript && config.openaiApiKey) {
    const speech = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "nova",
        input: transcript.slice(0, 1800),
      }),
    });
    if (speech.ok) {
      return new NextResponse(speech.body, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  }

  return new NextResponse(null, { status: 204 });
}

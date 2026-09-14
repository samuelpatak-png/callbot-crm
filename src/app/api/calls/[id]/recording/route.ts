import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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
    const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
    const headers: HeadersInit = {};
    if (settings?.twilioAccountSid && settings.twilioAuthToken && remote.includes("twilio.com")) {
      headers.Authorization = `Basic ${Buffer.from(
        `${settings.twilioAccountSid}:${settings.twilioAuthToken}`,
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
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (transcript && settings?.openaiApiKey) {
    const speech = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.openaiApiKey}`,
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

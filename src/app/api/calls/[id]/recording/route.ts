import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getRuntimeConfig } from "@/lib/settings";
import { isBlobRecordingUrl } from "@/lib/zadarma";

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
    const audio = await fetchRemoteRecording(remote);
    if (!audio) {
      return NextResponse.json({ error: "Nahrávku sa nepodarilo stiahnuť" }, { status: 502 });
    }
    return new NextResponse(audio.body, {
      headers: {
        "Content-Type": audio.headers.get("content-type") || guessAudioType(remote),
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  if (call.provider === "ZADARMA_REALTIME") {
    return new NextResponse(null, { status: 204 });
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

function guessAudioType(url: string) {
  if (url.endsWith(".wav")) return "audio/wav";
  if (url.endsWith(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

async function fetchRemoteRecording(remote: string) {
  const config = await getRuntimeConfig();
  const headers: HeadersInit = {};
  const twilio = remote.includes("twilio.com");
  const blob = isBlobRecordingUrl(remote);

  if (twilio && config.twilioAccountSid && config.twilioAuthToken) {
    headers.Authorization = `Basic ${Buffer.from(
      `${config.twilioAccountSid}:${config.twilioAuthToken}`,
    ).toString("base64")}`;
  }

  let audio = await fetch(remote, { headers });
  if (!audio.ok && blob && process.env.BLOB_READ_WRITE_TOKEN) {
    audio = await fetch(remote, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
  }
  if (!audio.ok) return null;
  return audio;
}

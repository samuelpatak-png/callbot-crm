import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePlaybook } from "@/lib/agent-briefing";

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function POST(request: Request) {
  const callId = new URL(request.url).searchParams.get("callId");
  const playbook = await ensurePlaybook();
  const call = callId
    ? await prisma.call.findUnique({
        where: { id: callId },
        select: { agentInstructions: true, realtimeSessionId: true },
      })
    : null;

  const opening =
    playbook.openingLine.trim() ||
    "Dobrý deň, volám z CallBotu. Skript pre ChatGPT je pripravený, hovor sa spája.";
  const loaded = Boolean(call?.realtimeSessionId || call?.agentInstructions);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="sk-SK" voice="Polly.Mia">${xmlEscape(opening.slice(0, 500))}</Say>
  <Pause length="1"/>
  <Say language="sk-SK" voice="Polly.Mia">${
    loaded
      ? "ChatGPT má načítaný firemný skript a argumenty. Živé pripojenie hlasu sa dokončí cez Realtime reláciu."
      : "Firemný skript ešte nie je pripojený k tomuto hovoru."
  }</Say>
  <Hangup/>
</Response>`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  return POST(request);
}

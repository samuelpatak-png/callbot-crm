import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { appUrl } from "./utils";
import { getRuntimeConfig } from "./settings";
import { extractEmailFromTranscript, normalizeEmail } from "./call-capture";
import { ensurePlaybook } from "./agent-briefing";
import { nextSpokenTurn } from "./openai-agent";

const MAX_TURNS = 10;

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function twimlResponse(inner: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function gatherAction(callId: string) {
  return `${appUrl()}/api/twilio/gather?callId=${encodeURIComponent(callId)}`;
}

export function gatherTwiml(callId: string, say: string) {
  const action = xmlEscape(gatherAction(callId));
  return twimlResponse(
    `<Say language="sk-SK" voice="Polly.Mia">${xmlEscape(say.slice(0, 900))}</Say><Gather input="speech" language="sk-SK" speechTimeout="auto" timeout="6" actionOnEmptyResult="true" action="${action}" method="POST"/><Redirect method="POST">${action}</Redirect>`,
  );
}

export function hangupTwiml(say: string) {
  return twimlResponse(
    `<Say language="sk-SK" voice="Polly.Mia">${xmlEscape(say.slice(0, 900))}</Say><Hangup/>`,
  );
}

export async function openingTwiml(callId: string) {
  const playbook = await ensurePlaybook();
  const opening =
    playbook.openingLine.trim() ||
    "Dobrý deň, volám z CallBotu. Máte dve minúty?";
  const say = `Tento hovor nahrávame. ${opening}`;
  await prisma.call.update({
    where: { id: callId },
    data: {
      status: "IN_PROGRESS",
      transcript: `Agent: ${say}`,
      conversationTurns: 0,
    },
  });
  return gatherTwiml(callId, say);
}

export async function continueConversation(opts: { callId: string; speech: string }) {
  const call = await prisma.call.findUnique({
    where: { id: opts.callId },
    include: { contact: true },
  });
  if (!call) {
    return hangupTwiml("Ospravedlňujem sa, hovor sa nepodarilo spárovať. Ďakujem a prajem pekný deň.");
  }

  const speech = opts.speech.trim();
  const turns = call.conversationTurns + 1;
  const previous = call.transcript?.trim() || "";
  const transcript = speech
    ? `${previous}\nKontakt: ${speech}`.trim()
    : previous;

  if (!speech) {
    await prisma.call.update({
      where: { id: call.id },
      data: { transcript, conversationTurns: turns, status: "IN_PROGRESS" },
    });
    if (turns <= 2) {
      return gatherTwiml(call.id, "Počujem vás? Kľudne pokračujte.");
    }
    return hangupTwiml("Nepočujem vás, ozvem sa inokedy. Ďakujem a prajem pekný deň.");
  }

  if (turns >= MAX_TURNS) {
    const email = extractEmailFromTranscript(transcript);
    await prisma.call.update({
      where: { id: call.id },
      data: {
        transcript,
        conversationTurns: turns,
        capturedEmail: email ?? call.capturedEmail,
        status: "IN_PROGRESS",
      },
    });
    return hangupTwiml("Ďakujem za čas, nechcem vás ďalej zdržiavať. Ozveme sa s podkladmi. Pekný deň.");
  }

  const config = await getRuntimeConfig();
  const playbook = await ensurePlaybook();
  const turn = await nextSpokenTurn({
    apiKey: config.openaiApiKey,
    instructions: call.agentInstructions || "",
    transcript,
    lastCustomer: speech,
    contactName: `${call.contact.firstName} ${call.contact.lastName}`.trim(),
    opening: playbook.openingLine,
    qualifying: playbook.qualifyingQuestions,
    callToAction: playbook.callToAction,
    turn: turns,
  });

  const nextTranscript = `${transcript}\nAgent: ${turn.say}`;
  const capturedEmail =
    normalizeEmail(turn.capturedEmail) ?? extractEmailFromTranscript(nextTranscript) ?? call.capturedEmail;

  await prisma.call.update({
    where: { id: call.id },
    data: {
      transcript: nextTranscript,
      conversationTurns: turns,
      capturedEmail,
      outcome: turn.outcome || call.outcome,
      status: "IN_PROGRESS",
    },
  });

  if (turn.endCall) {
    return hangupTwiml(turn.say);
  }
  return gatherTwiml(call.id, turn.say);
}

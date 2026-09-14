import type { CallStatus, VoiceProviderKind } from "@prisma/client";
import { appUrl } from "./utils";
import { demoSpokenEmail } from "./call-capture";

export type PlaceCallInput = {
  to: string;
  from?: string | null;
  contactId: string;
  contactName?: string | null;
  contactEmail?: string | null;
  campaignId?: string | null;
  callId?: string | null;
  scriptPrompt?: string | null;
  instructions?: string | null;
  twilioAccountSid?: string | null;
  twilioAuthToken?: string | null;
};

export type PlaceCallResult = {
  provider: VoiceProviderKind;
  providerCallSid: string;
  status: CallStatus;
  outcome: string;
  durationSec: number;
  summary: string;
  transcript?: string;
  recordingUrl?: string | null;
  recordingSid?: string | null;
};

export interface VoiceProvider {
  kind: VoiceProviderKind;
  placeCall(input: PlaceCallInput): Promise<PlaceCallResult>;
}

const OUTCOMES: Array<{
  status: CallStatus;
  outcome: string;
  weight: number;
  duration: [number, number];
}> = [
  { status: "COMPLETED", outcome: "connected", weight: 18, duration: [45, 180] },
  { status: "COMPLETED", outcome: "not_interested", weight: 10, duration: [40, 120] },
  { status: "NO_ANSWER", outcome: "no_answer", weight: 32, duration: [8, 22] },
  { status: "VOICEMAIL", outcome: "voicemail", weight: 18, duration: [12, 40] },
  { status: "BUSY", outcome: "busy", weight: 10, duration: [3, 8] },
  { status: "COMPLETED", outcome: "interested", weight: 8, duration: [60, 240] },
  { status: "FAILED", outcome: "failed", weight: 4, duration: [1, 5] },
];

function pickOutcome() {
  const total = OUTCOMES.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of OUTCOMES) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return OUTCOMES[0];
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function openingFrom(instructions?: string | null) {
  const match = instructions?.match(/„([^„“”\n]{8,280})“/);
  return match?.[1]?.trim() || "Dobrý deň, volám z CallBotu. Neruším vás na dve minúty?";
}

function stubTranscript(
  outcome: string,
  name: string,
  instructions?: string | null,
  email?: string | null,
) {
  const opening = openingFrom(instructions);
  const who = name || "pán / pani";
  const mail = demoSpokenEmail(name, email);
  if (outcome === "interested") {
    return `Agent: ${opening}\n${who}: Dobrý deň, počúvam.\nAgent: Volám, či máte chvíľu na krátku otázku k odchádzajúcim hovorom.\n${who}: Teraz áno. Znie to použiteľne, pošlite mi to na ${mail}.\nAgent: Ďakujem, na ${mail} pošleme podklady a dohodneme termín.`;
  }
  if (outcome === "no_answer") {
    return `Agent: ${opening}\n(nikto nezdvihol, hovor sa po niekoľkých zazvoneniach ukončil)`;
  }
  if (outcome === "voicemail") {
    return `Agent: ${opening}\nZáznamník: Zanechajte odkaz po signáli.\nAgent: Volám z CallBotu, ozvem sa neskôr.`;
  }
  if (outcome === "busy") {
    return `(linka obsadená, hovor sa nespojil)`;
  }
  if (outcome === "failed") {
    return `(hovor sa nepodarilo spojiť)`;
  }
  if (outcome === "not_interested") {
    return `Agent: ${opening}\n${who}: Ďakujem, teraz nemám záujem, ozvite sa inokedy.\nAgent: Rozumiem, ďakujem za čas.`;
  }
  return `Agent: ${opening}\n${who}: Počúvam, povedzte stručne.\nAgent: Volám kvôli odchádzajúcim hovorom, či máte chvíľu.\n${who}: Zatiaľ sa nerozhodnem, pošlite mi to na ${mail}.\nAgent: Ďakujem, na ${mail} pošleme podklady.`;
}

export class StubVoiceProvider implements VoiceProvider {
  kind: VoiceProviderKind = "STUB";

  async placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
    const picked = pickOutcome();
    const durationSec = randInt(picked.duration[0], picked.duration[1]);
    const sid = `stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const name = input.contactName?.trim() || input.to;
    const transcript = stubTranscript(picked.outcome, name, input.instructions, input.contactEmail);
    const summary =
      picked.outcome === "interested"
        ? `Simulovaný hovor na ${input.to}: kontakt prejavil záujem.`
        : `Simulovaný hovor na ${input.to}: výsledok ${picked.outcome}.`;
    const recordingUrl = input.callId ? `/api/calls/${input.callId}/recording` : null;

    return {
      provider: "STUB",
      providerCallSid: sid,
      status: picked.status,
      outcome: picked.outcome,
      durationSec,
      summary,
      transcript,
      recordingUrl,
      recordingSid: recordingUrl ? `rec_${sid}` : null,
    };
  }
}

export class TwilioVoiceProvider implements VoiceProvider {
  kind: VoiceProviderKind = "TWILIO";

  async placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
    const sid = input.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
    const token = input.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
    const from = input.from || process.env.TWILIO_FROM_NUMBER;

    if (!sid || !token || !from) {
      const fallback = new StubVoiceProvider();
      const result = await fallback.placeCall(input);
      return {
        ...result,
        summary: `${result.summary} Twilio kľúče ešte nie sú nastavené — použitý simulačný adaptér.`,
      };
    }

    const origin = appUrl();
    const callQs = input.callId ? `?callId=${encodeURIComponent(input.callId)}` : "";
    const twimlUrl = `${origin}/api/twilio/voice${callQs}`;

    const body = new URLSearchParams({
      To: input.to,
      From: from,
      Url: twimlUrl,
      Record: "true",
      RecordingStatusCallback: `${origin}/api/twilio/recording${callQs}`,
      RecordingStatusCallbackEvent: "completed",
      StatusCallback: `${origin}/api/twilio/status${callQs}`,
      StatusCallbackEvent: "initiated ringing answered completed",
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return {
        provider: "TWILIO",
        providerCallSid: `twilio_failed_${Date.now()}`,
        status: "FAILED",
        outcome: "twilio_error",
        durationSec: 0,
        summary: `Twilio hovor sa nepodarilo spustiť: ${text.slice(0, 280)}`,
      };
    }

    const data = (await response.json()) as { sid?: string; status?: string };
    return {
      provider: "TWILIO",
      providerCallSid: data.sid || `twilio_${Date.now()}`,
      status: "RINGING",
      outcome: data.status || "queued",
      durationSec: 0,
      summary: `Hovor cez Twilio na ${input.to} bol zaradený. Agent sa spája na linku.`,
    };
  }
}

export function getVoiceProvider(kind: VoiceProviderKind): VoiceProvider {
  if (kind === "TWILIO") return new TwilioVoiceProvider();
  return new StubVoiceProvider();
}

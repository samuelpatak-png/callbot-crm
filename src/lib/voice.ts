import type { CallStatus, VoiceProviderKind } from "@prisma/client";

export type PlaceCallInput = {
  to: string;
  from?: string | null;
  contactId: string;
  campaignId?: string | null;
  scriptPrompt?: string | null;
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
  { status: "COMPLETED", outcome: "connected", weight: 28, duration: [45, 180] },
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

export class StubVoiceProvider implements VoiceProvider {
  kind: VoiceProviderKind = "STUB";

  async placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
    const picked = pickOutcome();
    const durationSec = randInt(picked.duration[0], picked.duration[1]);
    const sid = `stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const summary =
      picked.outcome === "interested"
        ? `Simulovaný hovor na ${input.to}: kontakt prejavil záujem. Pripravené na ChatGPT Realtime.`
        : `Simulovaný hovor na ${input.to}: výsledok ${picked.outcome}. Twilio a ChatGPT Live API sa napoja neskôr.`;

    return {
      provider: "STUB",
      providerCallSid: sid,
      status: picked.status,
      outcome: picked.outcome,
      durationSec,
      summary,
      transcript: `[stub] Dial ${input.to} · ${picked.outcome}`,
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

    const app = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const twimlUrl = app
      ? `${app.startsWith("http") ? app : `https://${app}`}/api/twilio/voice`
      : undefined;

    const body = new URLSearchParams({
      To: input.to,
      From: from,
      Url: twimlUrl || "https://demo.twilio.com/docs/voice.xml",
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
      summary: `Hovor cez Twilio na ${input.to} bol zaradený. Realtime AI sa napojí cez webhook.`,
    };
  }
}

export function getVoiceProvider(kind: VoiceProviderKind): VoiceProvider {
  if (kind === "TWILIO") return new TwilioVoiceProvider();
  return new StubVoiceProvider();
}

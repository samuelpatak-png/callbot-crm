import { config } from "./config.js";

export type BridgeContext = {
  callId: string;
  contactId: string;
  contactName: string;
  instructions: string;
  model: string;
  voice: string;
  sessionId: string | null;
  clientSecret: string | null;
};

function headers() {
  const out: Record<string, string> = { "Content-Type": "application/json" };
  if (config.cronSecret) out.Authorization = `Bearer ${config.cronSecret}`;
  return out;
}

export async function fetchCallContext(body: {
  callId?: string;
  from?: string;
  to?: string;
  direction?: "inbound" | "outbound";
  providerCallSid?: string;
}) {
  if (!config.appUrl) throw new Error("APP_URL nie je nastavené");
  const response = await fetch(`${config.appUrl}/api/bridge/context`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`CRM context ${response.status}: ${raw.slice(0, 280)}`);
  }
  return JSON.parse(raw) as BridgeContext;
}

export async function postTranscript(body: {
  callId: string;
  transcript: string;
  capturedEmail?: string | null;
  recordingUrl?: string | null;
  durationSec?: number;
  status?: string;
  providerCallSid?: string | null;
  realtimeSessionId?: string | null;
  outcome?: string | null;
}) {
  if (!config.appUrl) throw new Error("APP_URL nie je nastavené");
  const response = await fetch(`${config.appUrl}/api/zadarma/transcript`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`CRM transcript ${response.status}: ${raw.slice(0, 280)}`);
  }
}

const EMAIL_RE = /[A-Za-zÀ-ž0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u;

export function extractEmail(transcript: string) {
  const spoken = transcript.replace(/\s+(zavináč|zavinac|at)\s+/gi, "@").replace(/\s+bodka\s+/gi, ".");
  const match = spoken.match(EMAIL_RE);
  return match?.[0]?.toLowerCase() ?? null;
}

import type { CallStatus } from "@prisma/client";

export type BridgeContextRequest = {
  callId?: string;
  from?: string;
  to?: string;
  direction?: "inbound" | "outbound";
  providerCallSid?: string;
};

export type BridgeContextResponse = {
  callId: string;
  contactId: string;
  contactName: string;
  instructions: string;
  model: string;
  voice: string;
  sessionId: string | null;
  clientSecret: string | null;
};

export type BridgeTranscriptPayload = {
  callId: string;
  transcript: string;
  capturedEmail?: string | null;
  recordingUrl?: string | null;
  durationSec?: number;
  status?: CallStatus | string;
  providerCallSid?: string | null;
  realtimeSessionId?: string | null;
  outcome?: string | null;
};

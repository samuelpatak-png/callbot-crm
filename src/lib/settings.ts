import { VoiceProviderKind } from "@prisma/client";
import { prisma } from "./prisma";

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export type RuntimeConfig = {
  companyName: string;
  voiceProvider: VoiceProviderKind;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  twilioFromNumber: string | null;
  openaiApiKey: string | null;
  openaiRealtimeModel: string;
  openaiRealtimeVoice: string;
  zadarmaApiKey: string | null;
  zadarmaApiSecret: string | null;
  zadarmaSipNumber: string | null;
  zadarmaSipPassword: string | null;
  bridgeServerUrl: string | null;
  twilioFromEnv: boolean;
  openaiFromEnv: boolean;
  zadarmaFromEnv: boolean;
  blobFromEnv: boolean;
};

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const settings = await prisma.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  const twilioFromEnv = Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim());
  const openaiFromEnv = Boolean(process.env.OPENAI_API_KEY?.trim());
  const zadarmaFromEnv = Boolean(process.env.ZADARMA_API_KEY?.trim() && process.env.ZADARMA_API_SECRET?.trim());
  return {
    companyName: settings.companyName,
    voiceProvider: settings.voiceProvider,
    twilioAccountSid: firstNonEmpty(process.env.TWILIO_ACCOUNT_SID, settings.twilioAccountSid),
    twilioAuthToken: firstNonEmpty(process.env.TWILIO_AUTH_TOKEN, settings.twilioAuthToken),
    twilioFromNumber: firstNonEmpty(process.env.TWILIO_FROM_NUMBER, settings.twilioFromNumber),
    openaiApiKey: firstNonEmpty(process.env.OPENAI_API_KEY, settings.openaiApiKey),
    openaiRealtimeModel: settings.openaiRealtimeModel || "gpt-4o-mini",
    openaiRealtimeVoice: settings.openaiRealtimeVoice || "marin",
    zadarmaApiKey: firstNonEmpty(process.env.ZADARMA_API_KEY, settings.zadarmaApiKey),
    zadarmaApiSecret: firstNonEmpty(process.env.ZADARMA_API_SECRET, settings.zadarmaApiSecret),
    zadarmaSipNumber: firstNonEmpty(process.env.ZADARMA_SIP_NUMBER, settings.zadarmaSipNumber),
    zadarmaSipPassword: firstNonEmpty(process.env.ZADARMA_SIP_PASSWORD, settings.zadarmaSipPassword),
    bridgeServerUrl: firstNonEmpty(process.env.BRIDGE_SERVER_URL, settings.bridgeServerUrl),
    twilioFromEnv,
    openaiFromEnv,
    zadarmaFromEnv,
    blobFromEnv: Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()),
  };
}

export function secretStored(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function maskSecret(stored: boolean, fromEnv: boolean) {
  if (fromEnv) return "nastavené v prostredí Vercelu";
  if (stored) return "uložené — nechajte prázdne, ak nemeníte";
  return "";
}

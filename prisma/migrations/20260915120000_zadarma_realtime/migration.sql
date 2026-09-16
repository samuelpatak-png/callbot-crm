DO $$ BEGIN
  ALTER TYPE "VoiceProviderKind" ADD VALUE 'ZADARMA_REALTIME';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "openaiRealtimeVoice" TEXT NOT NULL DEFAULT 'marin';
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "zadarmaApiKey" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "zadarmaApiSecret" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "zadarmaSipNumber" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "zadarmaSipPassword" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "bridgeServerUrl" TEXT;

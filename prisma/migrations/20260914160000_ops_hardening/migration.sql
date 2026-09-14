-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'AGENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'ADMIN';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Contact
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "marketingConsent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Campaign
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "workingDays" TEXT NOT NULL DEFAULT '1,2,3,4,5';

-- AlterTable Call
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "resultOverridden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "conversationTurns" INTEGER NOT NULL DEFAULT 0;

-- AlterTable AppSettings
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "mailFrom" TEXT;

-- AlterTable HarvestJob
ALTER TABLE "HarvestJob" ADD COLUMN IF NOT EXISTS "legalAcknowledgedAt" TIMESTAMP(3);

-- CreateTable MailMessage
CREATE TABLE IF NOT EXISTS "MailMessage" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "callId" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MailStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "provider" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MailMessage_contactId_createdAt_idx" ON "MailMessage"("contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "MailMessage_status_idx" ON "MailMessage"("status");
CREATE INDEX IF NOT EXISTS "MailMessage_callId_idx" ON "MailMessage"("callId");

DO $$ BEGIN
  ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Broader success: connected conversation or captured email
UPDATE "Call"
SET "resultKind" = 'SUCCESS'
WHERE "resultKind" <> 'SUCCESS'
  AND (
    "outcome" IN ('interested', 'callback')
    OR "capturedEmail" IS NOT NULL
    OR (
      "outcome" = 'connected'
      AND COALESCE(length("transcript"), 0) > 40
    )
  );

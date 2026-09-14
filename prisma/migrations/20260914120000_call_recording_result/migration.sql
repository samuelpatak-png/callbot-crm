-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CallResultKind" AS ENUM ('PENDING', 'SUCCESS', 'FAILURE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "recordingSid" TEXT;
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "resultKind" "CallResultKind" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "capturedEmail" TEXT;
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "debriefedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Call_resultKind_idx" ON "Call"("resultKind");

UPDATE "Call"
SET "resultKind" = 'SUCCESS'
WHERE "outcome" IN ('interested', 'callback');

UPDATE "Call"
SET "resultKind" = 'FAILURE'
WHERE "endedAt" IS NOT NULL
  AND "resultKind" = 'PENDING'
  AND COALESCE("outcome", '') NOT IN ('interested', 'callback', 'queued');

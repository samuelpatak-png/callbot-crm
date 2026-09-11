-- AlterTable
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "agentInstructions" TEXT;
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "realtimeSessionId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CallPlaybook" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL DEFAULT '',
    "companyAbout" TEXT NOT NULL DEFAULT '',
    "offer" TEXT NOT NULL DEFAULT '',
    "benefits" TEXT NOT NULL DEFAULT '',
    "openingLine" TEXT NOT NULL DEFAULT '',
    "qualifyingQuestions" TEXT NOT NULL DEFAULT '',
    "callToAction" TEXT NOT NULL DEFAULT '',
    "objections" JSONB NOT NULL DEFAULT '[]',
    "neverDo" TEXT NOT NULL DEFAULT '',
    "tone" TEXT NOT NULL DEFAULT 'Zdvorilý, stručný, hovoríš po slovensky. Počúvaš, neskáčeš do reči.',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallPlaybook_pkey" PRIMARY KEY ("id")
);

-- CreateEnum
CREATE TYPE "HarvestStatus" AS ENUM ('IDLE', 'RUNNING', 'PAUSED', 'STOPPED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "HarvestSiteStatus" AS ENUM ('QUEUED', 'ADDED', 'SKIPPED_SLOW', 'SKIPPED_MODERN', 'SKIPPED_NO_PHONE', 'DUPLICATE', 'FAILED');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contact_websiteUrl_idx" ON "Contact"("websiteUrl");

-- CreateTable
CREATE TABLE "HarvestJob" (
    "id" TEXT NOT NULL,
    "status" "HarvestStatus" NOT NULL DEFAULT 'IDLE',
    "queries" TEXT[],
    "queryIndex" INTEGER NOT NULL DEFAULT 0,
    "maxLoadMs" INTEGER NOT NULL DEFAULT 2000,
    "minScore" INTEGER NOT NULL DEFAULT 36,
    "delayMs" INTEGER NOT NULL DEFAULT 3500,
    "targetNewContacts" INTEGER NOT NULL DEFAULT 400,
    "attachToCampaign" BOOLEAN NOT NULL DEFAULT true,
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "skippedSlow" INTEGER NOT NULL DEFAULT 0,
    "skippedModern" INTEGER NOT NULL DEFAULT 0,
    "skippedNoPhone" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HarvestJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarvestedSite" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT,
    "loadMs" INTEGER,
    "score" INTEGER,
    "reasons" TEXT[],
    "phones" TEXT[],
    "status" "HarvestSiteStatus" NOT NULL DEFAULT 'QUEUED',
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HarvestedSite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HarvestedSite_canonicalUrl_key" ON "HarvestedSite"("canonicalUrl");

-- CreateIndex
CREATE INDEX "HarvestJob_status_idx" ON "HarvestJob"("status");

-- CreateIndex
CREATE INDEX "HarvestedSite_jobId_status_idx" ON "HarvestedSite"("jobId", "status");

-- CreateIndex
CREATE INDEX "HarvestedSite_domain_idx" ON "HarvestedSite"("domain");

-- CreateIndex
CREATE INDEX "HarvestedSite_createdAt_idx" ON "HarvestedSite"("createdAt");

-- AddForeignKey
ALTER TABLE "HarvestedSite" ADD CONSTRAINT "HarvestedSite_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "HarvestJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

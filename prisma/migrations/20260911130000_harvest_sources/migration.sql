-- AlterTable
ALTER TABLE "HarvestJob" ADD COLUMN IF NOT EXISTS "sources" TEXT[] NOT NULL DEFAULT ARRAY['zoznam', 'azet']::TEXT[];

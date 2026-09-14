DROP TABLE IF EXISTS "MailMessage";

ALTER TABLE "AppSettings" DROP COLUMN IF EXISTS "mailFrom";

DO $$ BEGIN
  DROP TYPE "MailStatus";
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

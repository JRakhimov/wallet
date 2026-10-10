-- Users the administrator let in with /access.
CREATE TABLE "AccessGrant" (
    "telegramId" BIGINT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("telegramId")
);

-- Reminders become per owner. Existing rows belong to the only owner that existed so far.
ALTER TABLE "Reminder" ADD COLUMN "ownerId" UUID;
UPDATE "Reminder" SET "ownerId" = (SELECT "id" FROM "Owner" ORDER BY "createdAt" LIMIT 1);
DELETE FROM "Reminder" WHERE "ownerId" IS NULL;
ALTER TABLE "Reminder" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Reminder" DROP CONSTRAINT "Reminder_pkey";
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_pkey" PRIMARY KEY ("ownerId", "kind", "date");
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

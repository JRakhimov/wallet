-- Tasks and notes: a note is a task without a date. Reminders are sent by the bot.
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "dueDate" TEXT,
    "dueTime" TEXT,
    "repeat" TEXT NOT NULL DEFAULT 'none',
    "repeatDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "anchorDate" TEXT,
    "remindAt" TIMESTAMPTZ(3),
    "snoozeAt" TIMESTAMPTZ(3),
    "doneAt" TIMESTAMPTZ(3),
    "idempotencyKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Task_ownerId_idempotencyKey_key" ON "Task"("ownerId", "idempotencyKey");

CREATE INDEX "Task_remindAt_idx" ON "Task"("remindAt");

CREATE INDEX "Task_snoozeAt_idx" ON "Task"("snoozeAt");

CREATE INDEX "Task_ownerId_doneAt_idx" ON "Task"("ownerId", "doneAt");

ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

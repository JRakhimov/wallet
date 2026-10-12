-- Chat assistant: dialog turns, facts about the person, actions waiting for a tap, settings.
CREATE TABLE "AssistantMessage" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssistantMessage_ownerId_createdAt_idx" ON "AssistantMessage"("ownerId", "createdAt");

ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssistantMemory" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssistantMemory_ownerId_idx" ON "AssistantMemory"("ownerId");

ALTER TABLE "AssistantMemory" ADD CONSTRAINT "AssistantMemory_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PendingAction" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PendingAction_ownerId_idx" ON "PendingAction"("ownerId");

ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssistantSettings" (
    "ownerId" UUID NOT NULL,
    "morningBriefAt" TEXT DEFAULT '08:00',
    "weeklyReport" BOOLEAN NOT NULL DEFAULT true,
    "historyFrom" TIMESTAMP(3),

    CONSTRAINT "AssistantSettings_pkey" PRIMARY KEY ("ownerId")
);

ALTER TABLE "AssistantSettings" ADD CONSTRAINT "AssistantSettings_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

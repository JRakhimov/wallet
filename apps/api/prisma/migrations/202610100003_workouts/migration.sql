-- CreateTable
CREATE TABLE "Workout" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "performedAt" TIMESTAMPTZ(3) NOT NULL,
    "kcal" INTEGER NOT NULL,
    "durationMin" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workout_ownerId_idempotencyKey_key" ON "Workout"("ownerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Workout_ownerId_performedAt_idx" ON "Workout"("ownerId", "performedAt");

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

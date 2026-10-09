-- CreateTable
CREATE TABLE "Meal" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "eatenAt" TIMESTAMPTZ(3) NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "comment" TEXT NOT NULL DEFAULT '',
    "photoId" UUID,
    "kcal" DECIMAL(7,1) NOT NULL,
    "proteinG" DECIMAL(6,1) NOT NULL,
    "fatG" DECIMAL(6,1) NOT NULL,
    "carbsG" DECIMAL(6,1) NOT NULL,
    "analysis" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealItem" (
    "id" UUID NOT NULL,
    "mealId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "grams" DECIMAL(6,1) NOT NULL,
    "kcal" DECIMAL(7,1) NOT NULL,
    "proteinG" DECIMAL(6,1) NOT NULL,
    "fatG" DECIMAL(6,1) NOT NULL,
    "carbsG" DECIMAL(6,1) NOT NULL,
    "confidence" TEXT,

    CONSTRAINT "MealItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPhoto" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meal_ownerId_eatenAt_idx" ON "Meal"("ownerId", "eatenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Meal_ownerId_idempotencyKey_key" ON "Meal"("ownerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MealItem_mealId_idx" ON "MealItem"("mealId");

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "MealPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealItem" ADD CONSTRAINT "MealItem_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPhoto" ADD CONSTRAINT "MealPhoto_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;


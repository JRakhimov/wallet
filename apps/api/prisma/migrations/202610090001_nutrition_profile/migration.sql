-- CreateTable
CREATE TABLE "NutritionProfile" (
    "ownerId" UUID NOT NULL,
    "sex" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "heightCm" INTEGER NOT NULL,
    "weightKg" DECIMAL(5,1) NOT NULL,
    "activityLevel" TEXT NOT NULL,
    "goal" TEXT NOT NULL DEFAULT 'lose',
    "deficitPercent" INTEGER NOT NULL DEFAULT 20,
    "surplusPercent" INTEGER NOT NULL DEFAULT 10,
    "kcalOverride" INTEGER,
    "proteinGOverride" INTEGER,
    "fatGOverride" INTEGER,
    "carbsGOverride" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionProfile_pkey" PRIMARY KEY ("ownerId")
);

-- AddForeignKey
ALTER TABLE "NutritionProfile" ADD CONSTRAINT "NutritionProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;


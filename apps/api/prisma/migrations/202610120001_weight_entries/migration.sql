-- Weight log: one weigh-in per day; the latest one is the profile's weight.
CREATE TABLE "WeightEntry" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "weightKg" DECIMAL(5,1) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeightEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeightEntry_ownerId_date_key" ON "WeightEntry"("ownerId", "date");

ALTER TABLE "WeightEntry" ADD CONSTRAINT "WeightEntry_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The current profile weight becomes the first entry, dated the day the profile was last saved.
INSERT INTO "WeightEntry" ("id", "ownerId", "date", "weightKg", "updatedAt")
SELECT gen_random_uuid(), p."ownerId", to_char(p."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE o."timezone", 'YYYY-MM-DD'), p."weightKg", CURRENT_TIMESTAMP
FROM "NutritionProfile" p
JOIN "Owner" o ON o."id" = p."ownerId";

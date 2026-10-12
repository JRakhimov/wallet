-- The weather of the day in the morning brief, for a chosen city.
ALTER TABLE "AssistantSettings" ADD COLUMN "briefWeather" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AssistantSettings" ADD COLUMN "weatherPlace" TEXT;

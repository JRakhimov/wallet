-- The evening brief: the day's results and tomorrow (weather, tasks, charges). Owners who already
-- have settings get it too, at the default time.
ALTER TABLE "AssistantSettings" ADD COLUMN "eveningBriefAt" TEXT DEFAULT '21:00';

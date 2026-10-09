-- Meals are recognized in the background: failed ones keep the reason shown to the owner.
ALTER TABLE "Meal" ADD COLUMN "error" TEXT;

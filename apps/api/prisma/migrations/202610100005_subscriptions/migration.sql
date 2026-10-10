-- Monthly subscriptions: name, amount and the day of the month they are charged.
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "chargeDay" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Subscription_ownerId_idx" ON "Subscription"("ownerId");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

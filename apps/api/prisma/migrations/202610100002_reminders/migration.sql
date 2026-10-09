-- CreateTable
CREATE TABLE "Reminder" (
    "kind" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("kind","date")
);

-- Accounts and operations may now be in USD as well as UZS.
ALTER TABLE "Account" DROP CONSTRAINT "Account_currency_check";
ALTER TABLE "Account" ADD CONSTRAINT "Account_currency_check" CHECK ("currency" IN ('UZS', 'USD'));

ALTER TABLE "Operation" DROP CONSTRAINT "Operation_currency_check";
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_currency_check" CHECK ("currency" IN ('UZS', 'USD'));

-- Exchange rate (UZS per 1 USD) of a transfer between accounts in different currencies.
ALTER TABLE "Operation" ADD COLUMN "rate" DECIMAL(20,6);
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_rate_check" CHECK ("rate" IS NULL OR "rate" > 0);

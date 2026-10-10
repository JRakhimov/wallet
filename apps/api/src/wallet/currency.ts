import { Prisma } from "@prisma/client";

export const CURRENCIES = ["UZS", "USD"] as const;

export type Currency = (typeof CURRENCIES)[number];

/** The currency reports, budgets and subscriptions are kept in. */
export const BASE_CURRENCY: Currency = "UZS";

const MONEY_DECIMALS = 2;

/**
 * The amount a transfer credits to its target account, converted at the user's rate
 * (UZS per 1 USD): dollars become `amount × rate` sums, sums become `amount ÷ rate` dollars.
 */
export function convertAtRate(amount: Prisma.Decimal, from: string, rate: Prisma.Decimal) {
  const converted = from === "USD" ? amount.times(rate) : amount.div(rate);

  return converted.toDecimalPlaces(MONEY_DECIMALS, Prisma.Decimal.ROUND_HALF_UP);
}

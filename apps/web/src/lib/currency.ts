import { Account } from "../api";

/** Whether a transfer between two accounts needs an exchange rate. */
export function isCrossCurrency(accounts: Account[], sourceId: string, targetId: string) {
  const source = accounts.find((account) => account.id === sourceId);
  const target = accounts.find((account) => account.id === targetId);

  return Boolean(source && target && source.currency !== target.currency);
}

/**
 * Roughly what a transfer credits, for showing before saving. The server does the real
 * conversion: dollars become `amount × rate` sums, sums become `amount ÷ rate` dollars.
 */
export function creditedAmount(amount: number, fromCurrency: string, rate: number) {
  const converted = fromCurrency === "USD" ? amount * rate : amount / rate;

  return Math.round(converted * 100) / 100;
}

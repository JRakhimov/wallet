import { DateTime } from "luxon";

export const money = (value: string | number, decimals = false) =>
  new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
/** What an amount in a currency is called on screen: "сум" or "$". */
export const currencyUnit = (currency: string) => (currency === "USD" ? "$" : "сум");

/** "1 300 000 сум", "12,50 $": dollars always show cents. */
export const formatMoney = (value: string | number, currency: string) =>
  `${money(value, currency === "USD")} ${currencyUnit(currency)}`;

/** Plain API amount from user input: "1 300,5" → "1300.5", "5." → "5". */
export const normalizeAmount = (value: string) =>
  value.replace(/\s/g, "").replace(",", ".").replace(/\.$/, "");
export function parseCents(value: string) {
  const normalized = normalizeAmount(value);
  if (!/^-?(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return (
    (whole.startsWith("-") ? -1 : 1) *
    (Math.abs(Number(whole)) * 100 + Number(fraction.padEnd(2, "0")))
  );
}
export const centsToAmount = (value: number) =>
  `${Math.floor(Math.abs(value) / 100)}.${String(Math.abs(value) % 100).padStart(2, "0")}`;
export const monthLabel = (month: string) =>
  DateTime.fromISO(month + "-01")
    .setLocale("ru")
    .toFormat("LLLL yyyy");
export const today = () => DateTime.now().setZone("Asia/Tashkent").toFormat("yyyy-MM-dd");
export const currentMonth = () => today().slice(0, 7);
export function occurrenceForDay(day: string, zone: string) {
  if (day === DateTime.now().setZone(zone).toFormat("yyyy-MM-dd")) return new Date().toISOString();
  return DateTime.fromISO(day, { zone })
    .set({ hour: 12, minute: 0, second: 0, millisecond: 0 })
    .toUTC()
    .toISO()!;
}

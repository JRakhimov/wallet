import { DateTime } from "luxon";

export const money = (value: string | number, decimals = false) =>
  new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
export const normalizeAmount = (value: string) => value.replace(/\s/g, "").replace(",", ".");
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
export function amountFromKeys(value: string, key: string) {
  if (key === "clear") return "";
  if (key === "backspace") return value.slice(0, -1);
  if (key === "decimal") return value.includes(".") ? value : (value || "0") + ".";
  if (!/^\d$/.test(key)) return value;
  const parts = value.split(".");
  if (parts.length === 2 && parts[1].length >= 2) return value;
  if (parts.length === 1 && parts[0].length >= 12) return value;
  return value === "0" ? key : value + key;
}
export function amountLabel(value: string) {
  const [integer, fraction] = value.split(".");
  return money(integer || 0) + (value.includes(".") ? "," + (fraction || "") : "");
}

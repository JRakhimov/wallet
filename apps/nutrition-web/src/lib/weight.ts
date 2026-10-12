import { DateTime } from "luxon";

const kgFormat = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 82.4 → "82,4 кг". */
export function formatKg(kg: number) {
  return `${kgFormat.format(kg)} кг`;
}

/** −0.6 → "−0,6 кг", 1.2 → "+1,2 кг", 0 → "0 кг". */
export function formatKgChange(kg: number) {
  if (kg === 0) {
    return "0 кг";
  }

  const sign = kg > 0 ? "+" : "−";

  return `${sign}${formatKg(Math.abs(kg))}`;
}

/** "12 октября", or "12 октября 2025" for another year. */
export function weighInDate(date: string) {
  const day = DateTime.fromISO(date).setLocale("ru");
  const sameYear = day.year === DateTime.now().year;

  return day.toFormat(sameYear ? "d MMMM" : "d MMMM yyyy");
}

import { DateTime } from "luxon";

export type WeightPoint = { date: string; weightKg: number };

/** Kilograms with one decimal, so 82.4 - 83.0 is -0.6 and not -0.5999. */
function roundKg(value: number) {
  return Math.round(value * 10) / 10;
}

/**
 * The latest weight and how it changed against the last weigh-in at least `days` before it.
 * `entries` are sorted by date, oldest first.
 */
export function weightSummary(entries: WeightPoint[]) {
  const latest = entries.at(-1);
  if (!latest) {
    return { current: null, change7: null, change30: null };
  }

  const changeSince = (days: number) => {
    const before = DateTime.fromISO(latest.date).minus({ days }).toISODate()!;
    const base = entries.filter((entry) => entry.date <= before).at(-1);

    return base ? roundKg(latest.weightKg - base.weightKg) : null;
  };

  return { current: latest.weightKg, change7: changeSince(7), change30: changeSince(30) };
}

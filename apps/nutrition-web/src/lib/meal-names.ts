import { DateTime } from "luxon";
import { Meal } from "../api";

/** Meal names by the hour they were eaten (local time). Change the boundaries here. */
const MEAL_SLOTS: { name: string; from: number; to: number }[] = [
  { name: "Завтрак", from: 5, to: 11 },
  { name: "Обед", from: 11, to: 16 },
  { name: "Ужин", from: 16, to: 22 },
];
const SNACK = "Перекус";

/** All that is needed to name a meal; also fits meals that are still being recognized. */
type MealMoment = { id: string; eatenAt: string };

/**
 * Names for the meals of one day, keyed by meal id. The first meal in a slot gets the slot's
 * name; later meals in the same slot and night meals are snacks.
 */
export function mealNames(meals: MealMoment[], timezone: string) {
  const names = new Map<string, string>();
  const usedSlots = new Set<string>();
  const byTime = [...meals].sort((a, b) => a.eatenAt.localeCompare(b.eatenAt));

  for (const meal of byTime) {
    const hour = DateTime.fromISO(meal.eatenAt).setZone(timezone).hour;
    const slot = MEAL_SLOTS.find((candidate) => hour >= candidate.from && hour < candidate.to);
    if (slot && !usedSlots.has(slot.name)) {
      usedSlots.add(slot.name);
      names.set(meal.id, slot.name);
    } else {
      names.set(meal.id, SNACK);
    }
  }
  return names;
}

export function mealTime(meal: Pick<Meal, "eatenAt">, timezone: string) {
  return DateTime.fromISO(meal.eatenAt).setZone(timezone).toFormat("HH:mm");
}

/** "Плов, чай и ещё 2" — short list of what was eaten. */
export function itemsSummary(meal: Meal, visible = 2) {
  const names = meal.items.map((item) => item.name);
  const shown = names.slice(0, visible).join(", ");
  const rest = names.length - visible;
  return rest > 0 ? `${shown} и ещё ${rest}` : shown;
}

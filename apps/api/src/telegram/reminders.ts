import { DateTime } from "luxon";

export type ReminderKind = "lunch" | "evening";

/** When each check runs (owner's local time) and how long after that it may still run. */
export const REMINDER_SCHEDULE: Record<ReminderKind, { hour: number }> = {
  lunch: { hour: 14 },
  evening: { hour: 20 },
};
/** After a restart a missed reminder is still sent, but not hours late. */
export const GRACE_MINUTES = 60;
/** The day's expenses below this count trigger the evening reminder. */
export const MIN_EXPENSES = 2;
/** A meal eaten from this hour on counts as dinner. */
export const DINNER_FROM_HOUR = 16;

/** Reminders whose time has come and has not passed the grace period. */
export function dueReminders(now: DateTime): ReminderKind[] {
  return (Object.keys(REMINDER_SCHEDULE) as ReminderKind[]).filter((kind) => {
    const start = now.startOf("day").plus({ hours: REMINDER_SCHEDULE[kind].hour });
    return now >= start && now < start.plus({ minutes: GRACE_MINUTES });
  });
}

export type DayState = {
  /** The owner uses the nutrition app (has a profile). */
  tracksMeals: boolean;
  mealsToday: number;
  dinnerLogged: boolean;
  expensesToday: number;
};

export type Reminder = { text: string; apps: ("wallet" | "nutrition")[] };

function expensesPhrase(count: number) {
  if (count === 0) {
    return "ни одного расхода";
  }
  return count === 1 ? "только один расход" : `только ${count} расхода`;
}

/** What to remind about, or null when everything is in order. */
export function reminderFor(kind: ReminderKind, day: DayState): Reminder | null {
  if (kind === "lunch") {
    return day.tracksMeals && day.mealsToday === 0
      ? {
          text: "🍽 Уже 14:00, а в дневнике питания за сегодня пусто. Не забыли записать приём пищи?",
          apps: ["nutrition"],
        }
      : null;
  }

  const noDinner = day.tracksMeals && !day.dinnerLogged;
  const fewExpenses = day.expensesToday < MIN_EXPENSES;
  if (noDinner && fewExpenses) {
    return {
      text: `🌙 Уже 20:00. Ужин не записан, а за день внесено ${expensesPhrase(day.expensesToday)}. Не забыли записать ужин и траты?`,
      apps: ["nutrition", "wallet"],
    };
  }
  if (noDinner) {
    return {
      text: "🍽 Уже 20:00, а ужин не записан. Не забыли отметить приём пищи?",
      apps: ["nutrition"],
    };
  }
  if (fewExpenses) {
    return {
      text: `💳 За сегодня внесено ${expensesPhrase(day.expensesToday)}. Не забыли записать все траты за день?`,
      apps: ["wallet"],
    };
  }
  return null;
}

import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";

export type ReminderKind = "lunch" | "evening" | "subscription_eve" | "subscription_morning";

/** When each check runs (owner's local time) and how long after that it may still run. */
export const REMINDER_SCHEDULE: Record<ReminderKind, { hour: number }> = {
  lunch: { hour: 14 },
  evening: { hour: 20 },
  // The day before a charge, and early on the day itself.
  subscription_eve: { hour: 18 },
  subscription_morning: { hour: 8 },
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

export type SubscriptionDue = { name: string; amount: string };

export type DayState = {
  /** The owner uses the nutrition app (has a profile). */
  tracksMeals: boolean;
  mealsToday: number;
  dinnerLogged: boolean;
  expensesToday: number;
  subscriptionsToday: SubscriptionDue[];
  subscriptionsTomorrow: SubscriptionDue[];
};

export type Reminder = { text: string; apps: ("wallet" | "nutrition")[] };

function expensesPhrase(count: number) {
  if (count === 0) {
    return "ни одного расхода";
  }
  return count === 1 ? "только один расход" : `только ${count} расхода`;
}

/** "1500000.00" → "1 500 000", "49.90" → "49,90". */
function formatMoney(amount: Prisma.Decimal.Value) {
  const [integer, fraction] = new Prisma.Decimal(amount).toFixed(2).split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return fraction === "00" ? grouped : `${grouped},${fraction}`;
}

/** Lists the subscriptions charged on a day, with the total when there are several. */
function subscriptionReminder(heading: string, due: SubscriptionDue[]): Reminder | null {
  if (due.length === 0) {
    return null;
  }

  const lines = due.map(({ name, amount }) => `• ${name}: ${formatMoney(amount)} сум`);
  if (due.length > 1) {
    const total = due.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
    lines.push(`Итого: ${formatMoney(total)} сум`);
  }

  return { text: [heading, ...lines].join("\n"), apps: ["wallet"] };
}

/** What to remind about, or null when everything is in order. */
export function reminderFor(kind: ReminderKind, day: DayState): Reminder | null {
  if (kind === "subscription_eve") {
    return subscriptionReminder("📅 Завтра спишутся подписки:", day.subscriptionsTomorrow);
  }

  if (kind === "subscription_morning") {
    return subscriptionReminder("☀️ Сегодня спишутся подписки:", day.subscriptionsToday);
  }

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

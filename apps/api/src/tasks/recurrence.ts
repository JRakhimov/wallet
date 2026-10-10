import { DateTime } from "luxon";
import { chargeDayIn } from "../wallet/subscriptions/charge-date";

export const REPEATS = ["none", "daily", "weekdays", "weekly", "monthly", "yearly"] as const;
export type Repeat = (typeof REPEATS)[number];

/** A task without a time is reminded about at this hour of its day. */
export const ALL_DAY_REMIND_HOUR = 9;

/** The part of a task that decides when it is due and how it repeats. */
export type Schedule = {
  dueDate: string | null;
  dueTime: string | null;
  repeat: Repeat;
  repeatDays: number[];
  anchorDate: string | null;
};

const SATURDAY = 6;
/** Enough to find the next weekday or chosen day of the week. */
const MAX_DAYS_AHEAD = 8;

/** "2026-10-11" + "10:00" in the owner's zone → the moment to remind; null for a note. */
export function remindAtFor(schedule: Pick<Schedule, "dueDate" | "dueTime">, timezone: string) {
  if (!schedule.dueDate) {
    return null;
  }

  const day = DateTime.fromISO(schedule.dueDate, { zone: timezone });
  const [hour, minute] = schedule.dueTime
    ? schedule.dueTime.split(":").map(Number)
    : [ALL_DAY_REMIND_HOUR, 0];

  return day.set({ hour, minute }).toJSDate();
}

/** The next local date of a repeating task strictly after `after` (yyyy-MM-dd). */
export function nextOccurrence(schedule: Schedule, after: string) {
  const previous = DateTime.fromISO(after);

  switch (schedule.repeat) {
    case "none":
      return null;

    case "daily":
      return previous.plus({ days: 1 }).toISODate()!;

    case "weekdays":
      return firstDayAfter(previous, (day) => day.weekday < SATURDAY);

    case "weekly":
      return firstDayAfter(previous, (day) => schedule.repeatDays.includes(day.weekday));

    case "monthly":
      return sameDayNextMonth(schedule, previous);

    case "yearly":
      return sameDayNextYear(schedule, previous);
  }
}

function firstDayAfter(previous: DateTime, matches: (day: DateTime) => boolean) {
  for (let offset = 1; offset <= MAX_DAYS_AHEAD; offset++) {
    const day = previous.plus({ days: offset });

    if (matches(day)) {
      return day.toISODate()!;
    }
  }

  return null;
}

function anchorOf(schedule: Schedule, previous: DateTime) {
  return DateTime.fromISO(schedule.anchorDate ?? previous.toISODate()!);
}

function sameDayNextMonth(schedule: Schedule, previous: DateTime) {
  const anchor = anchorOf(schedule, previous);
  const month = previous.startOf("month").plus({ months: 1 });

  return month.set({ day: chargeDayIn(anchor.day, month) }).toISODate()!;
}

function sameDayNextYear(schedule: Schedule, previous: DateTime) {
  const anchor = anchorOf(schedule, previous);
  const month = previous.startOf("month").plus({ years: 1 }).set({ month: anchor.month });

  // 29 February moves to 28 February in a common year.
  return month.set({ day: chargeDayIn(anchor.day, month) }).toISODate()!;
}

/**
 * Moves a repeating task to its first date whose reminder is still ahead of `now`, so
 * occurrences missed while the server was down do not pile up. A one-off task stays put.
 */
export function advance(schedule: Schedule, now: Date, timezone: string) {
  if (schedule.repeat === "none" || !schedule.dueDate) {
    return null;
  }

  let dueDate: string | null = schedule.dueDate;

  do {
    dueDate = nextOccurrence(schedule, dueDate);
  } while (dueDate && remindAtFor({ dueDate, dueTime: schedule.dueTime }, timezone)! <= now);

  if (!dueDate) {
    return null;
  }

  return {
    dueDate,
    remindAt: remindAtFor({ dueDate, dueTime: schedule.dueTime }, timezone),
  };
}

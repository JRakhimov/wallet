import { DateTime } from "luxon";
import { Task } from "../api";

/** Today's date (yyyy-MM-dd) in the owner's timezone. */
export function todayIn(timezone: string) {
  return DateTime.now().setZone(timezone).toISODate()!;
}

export function plusDays(date: string, days: number) {
  return DateTime.fromISO(date).plus({ days }).toISODate()!;
}

/** Overdue: the day has passed, or today's time has passed. */
export function isOverdue(task: Task, timezone: string) {
  if (!task.dueDate || task.doneAt) {
    return false;
  }

  const now = DateTime.now().setZone(timezone);
  const today = now.toISODate()!;

  if (task.dueDate !== today) {
    return task.dueDate < today;
  }

  return task.dueTime !== null && task.dueTime < now.toFormat("HH:mm");
}

/** "Сегодня", "Завтра", "Вчера", "Вт, 13 октября", "Пн, 4 января 2027". */
export function dayLabel(date: string, timezone: string) {
  const today = todayIn(timezone);
  const relative: Record<string, string> = {
    [today]: "Сегодня",
    [plusDays(today, 1)]: "Завтра",
    [plusDays(today, -1)]: "Вчера",
  };

  if (relative[date]) {
    return relative[date];
  }

  const day = DateTime.fromISO(date).setLocale("ru");
  const sameYear = day.year === DateTime.fromISO(today).year;
  const text = day.toFormat(sameYear ? "ccc, d MMMM" : "ccc, d MMMM yyyy");

  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Earlier dates first, then earlier times; a task for the whole day goes before timed ones. */
export function byDue(a: Task, b: Task) {
  const date = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
  if (date !== 0) {
    return date;
  }

  return (a.dueTime ?? "").localeCompare(b.dueTime ?? "");
}

/** Tasks grouped by their date, in date order. */
export function groupByDate(tasks: Task[]) {
  const groups = new Map<string, Task[]>();

  for (const task of [...tasks].sort(byDue)) {
    const date = task.dueDate!;
    groups.set(date, [...(groups.get(date) ?? []), task]);
  }

  return [...groups.entries()].map(([date, items]) => ({ date, tasks: items }));
}

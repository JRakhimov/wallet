import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { dueLabel, repeatLabel } from "../tasks/labels";
import { remindAtFor } from "../tasks/recurrence";
import { TaskView } from "../tasks/tasks.service";

/** A task without a time is reminded about at this time of its day. */
const ALL_DAY_TIME = "09:00";

const CURRENCY_LABELS: Record<string, string> = { UZS: "сум", USD: "$" };

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** 82.4 → "82,4", 45000 → "45 000", with plain spaces like `formatMoney`. */
export function formatAmount(amount: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 })
    .format(amount)
    .replace(/\s/g, " ");
}

/** "1500000.00" → "1 500 000", "49.90" → "49,90". */
export function formatMoney(amount: Prisma.Decimal.Value) {
  const [integer, fraction] = new Prisma.Decimal(amount).toFixed(2).split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return fraction === "00" ? grouped : `${grouped},${fraction}`;
}

/** "45 000 сум", "120 $". */
export function formatMoneyIn(amount: Prisma.Decimal.Value, currency: string) {
  return `${formatMoney(amount)} ${CURRENCY_LABELS[currency] ?? currency}`;
}

/** "−0,6 кг", "+1,2 кг", "без изменений". */
export function formatChange(kg: number) {
  if (kg === 0) {
    return "без изменений";
  }

  const sign = kg > 0 ? "+" : "−";

  return `${sign}${formatAmount(Math.abs(kg))} кг`;
}

/** "сегодня", "вчера", "12 октября", "3 марта 2025" relative to `now`. */
export function dayLabel(date: string, now: DateTime) {
  const day = DateTime.fromISO(date, { zone: now.zone });
  const days = Math.round(now.startOf("day").diff(day.startOf("day"), "days").days);

  if (days === 0) {
    return "сегодня";
  }

  if (days === 1) {
    return "вчера";
  }

  const year = day.year === now.year ? "" : ` ${day.year}`;

  return `${day.day} ${MONTHS_GENITIVE[day.month - 1]}${year}`;
}

/** "октябрь 2026". */
export function monthLabel(month: string) {
  return DateTime.fromISO(`${month}-01`).setLocale("ru").toFormat("LLLL yyyy");
}

/** "Напомню завтра в 10:00: …", "Заметка записана: …" and the like. */
export function taskConfirmation(task: TaskView, now: DateTime) {
  if (!task.dueDate) {
    return `Заметка записана: ${task.title}`;
  }

  const time = task.dueTime ?? ALL_DAY_TIME;

  if (task.repeat !== "none") {
    const repeat = repeatLabel(task.repeat, task.repeatDays, task.dueDate);
    const first = dueLabel(task.dueDate, time, now);

    return `Буду напоминать ${repeat} в ${time}: ${task.title}. Первый раз: ${first}`;
  }

  const remindAt = remindAtFor({ dueDate: task.dueDate, dueTime: task.dueTime }, now.zoneName!);
  if (remindAt && remindAt <= now.toJSDate()) {
    return `Записал на ${dueLabel(task.dueDate, null, now)}: ${task.title}`;
  }

  return `Напомню ${dueLabel(task.dueDate, time, now)}: ${task.title}`;
}

/** When a task is due, in words: "завтра в 10:00", "каждый день в 09:00", "без срока". */
export function taskDue(task: TaskView, now: DateTime) {
  if (!task.dueDate) {
    return "без срока";
  }

  if (task.repeat !== "none") {
    const repeat = repeatLabel(task.repeat, task.repeatDays, task.dueDate);

    return `${repeat} в ${task.dueTime ?? ALL_DAY_TIME}, ближайший раз ${dueLabel(task.dueDate, task.dueTime, now)}`;
  }

  return dueLabel(task.dueDate, task.dueTime, now);
}

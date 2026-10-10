import { DateTime } from "luxon";
import { Repeat } from "./recurrence";

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const WEEKDAYS_ACCUSATIVE = [
  "понедельник",
  "вторник",
  "среду",
  "четверг",
  "пятницу",
  "субботу",
  "воскресенье",
];
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

/** "каждый день", "по будням", "по пн, ср", "каждый месяц 15-го", "каждый год 3 марта". */
export function repeatLabel(repeat: Repeat, repeatDays: number[], anchorDate: string | null) {
  const anchor = anchorDate ? DateTime.fromISO(anchorDate) : null;

  switch (repeat) {
    case "none":
      return "";

    case "daily":
      return "каждый день";

    case "weekdays":
      return "по будням";

    case "weekly":
      return weeklyLabel(repeatDays);

    case "monthly":
      return anchor ? `каждый месяц ${anchor.day}-го` : "каждый месяц";

    case "yearly":
      return anchor
        ? `каждый год ${anchor.day} ${MONTHS_GENITIVE[anchor.month - 1]}`
        : "каждый год";
  }
}

function weeklyLabel(repeatDays: number[]) {
  if (repeatDays.length === 1) {
    const day = repeatDays[0];
    const every = day === 3 || day === 5 || day === 6 ? "каждую" : "каждый";

    return day === 7 ? "каждое воскресенье" : `${every} ${WEEKDAYS_ACCUSATIVE[day - 1]}`;
  }

  return `по ${repeatDays.map((day) => WEEKDAYS[day - 1]).join(", ")}`;
}

/** "сегодня в 10:00", "завтра", "в пн, 13 октября в 09:00" relative to `today`. */
export function dueLabel(dueDate: string, dueTime: string | null, today: DateTime) {
  const date = DateTime.fromISO(dueDate, { zone: today.zone });
  const days = Math.round(date.diff(today.startOf("day"), "days").days);
  const time = dueTime ? ` в ${dueTime}` : "";

  if (days === 0) {
    return `сегодня${time}`;
  }

  if (days === 1) {
    return `завтра${time}`;
  }

  const year = date.year === today.year ? "" : ` ${date.year}`;
  const day = `${WEEKDAYS[date.weekday - 1]}, ${date.day} ${MONTHS_GENITIVE[date.month - 1]}`;

  return `${day}${year}${time}`;
}

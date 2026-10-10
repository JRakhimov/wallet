import { SelectChoice } from "@ui/components/SelectField";
import { Repeat, Task } from "../api";

export const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

const WEEKDAYS_ACCUSATIVE = [
  "понедельник",
  "вторник",
  "среду",
  "четверг",
  "пятницу",
  "субботу",
  "воскресенье",
];

export const REPEAT_OPTIONS: SelectChoice[] = [
  { value: "none", label: "Не повторять" },
  { value: "daily", label: "Каждый день" },
  { value: "weekdays", label: "По будням", detail: "пн–пт" },
  { value: "weekly", label: "По дням недели" },
  { value: "monthly", label: "Каждый месяц" },
  { value: "yearly", label: "Каждый год" },
];

const SUNDAY = 7;

/** "каждый день", "по будням", "каждую среду", "по пн, ср, пт", "каждый месяц". */
export function repeatText(task: Pick<Task, "repeat" | "repeatDays">) {
  const labels: Record<Exclude<Repeat, "weekly">, string> = {
    none: "",
    daily: "каждый день",
    weekdays: "по будням",
    monthly: "каждый месяц",
    yearly: "каждый год",
  };

  if (task.repeat !== "weekly") {
    return labels[task.repeat];
  }

  if (task.repeatDays.length === 1) {
    return everyWeekday(task.repeatDays[0]);
  }

  return `по ${task.repeatDays.map((day) => WEEKDAYS[day - 1]).join(", ")}`;
}

function everyWeekday(day: number) {
  if (day === SUNDAY) {
    return "каждое воскресенье";
  }

  const feminine = day === 3 || day === 5 || day === 6;

  return `${feminine ? "каждую" : "каждый"} ${WEEKDAYS_ACCUSATIVE[day - 1]}`;
}

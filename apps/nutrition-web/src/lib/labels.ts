import { ActivityLevel, Goal, NutritionProfile, Sex } from "../api";

export const sexOptions: { value: Sex; label: string }[] = [
  { value: "male", label: "Мужской" },
  { value: "female", label: "Женский" },
];

export const activityOptions: { value: ActivityLevel; label: string; detail: string }[] = [
  { value: "sedentary", label: "Минимальная", detail: "Сидячая работа, почти без спорта" },
  { value: "light", label: "Лёгкая", detail: "1–3 тренировки или прогулки в неделю" },
  { value: "moderate", label: "Средняя", detail: "3–5 тренировок в неделю" },
  { value: "high", label: "Высокая", detail: "6–7 тренировок в неделю" },
  { value: "very_high", label: "Очень высокая", detail: "Физический труд и ежедневный спорт" },
];

export const goalOptions: { value: Goal; label: string }[] = [
  { value: "lose", label: "Похудение" },
  { value: "maintain", label: "Поддержание" },
  { value: "gain", label: "Набор" },
];

/** Allowed pace per goal, percent of daily expenditure. Matches the API validation. */
export const deficitOptions = [10, 15, 20, 25];
export const surplusOptions = [5, 10, 15];

export const activityLabel = (level: ActivityLevel) =>
  activityOptions.find((option) => option.value === level)?.label ?? level;

export const sexLabel = (sex: Sex) => sexOptions.find((option) => option.value === sex)?.label;

/** Why the calorie target is higher than the chosen deficit would give. */
export function limitExplanation(profile: NutritionProfile) {
  if (profile.limitedBy === "bmr") {
    return "Цель поднята до расхода в покое: есть меньше небезопасно.";
  }
  if (profile.limitedBy === "minimum") {
    const minimum = profile.sex === "male" ? 1500 : 1200;
    return `Цель поднята до безопасного минимума ${minimum} ккал.`;
  }
  return null;
}

/** "1 980" with a thin group separator, like money amounts elsewhere. */
export const formatNumber = (value: number) =>
  new Intl.NumberFormat("ru-RU").format(Math.round(value));

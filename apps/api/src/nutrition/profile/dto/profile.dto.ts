import { z } from "zod";
import { ACTIVITY_LEVELS, GOALS, SEXES } from "../energy";

const MIN_AGE_YEARS = 14;
const OLDEST_BIRTH_YEAR = 1920;

const birthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату рождения")
  .refine((value) => {
    const date = new Date(value);
    const latest = new Date();
    latest.setFullYear(latest.getFullYear() - MIN_AGE_YEARS);
    return (
      !Number.isNaN(date.getTime()) && date.getFullYear() >= OLDEST_BIRTH_YEAR && date <= latest
    );
  }, `Возраст должен быть от ${MIN_AGE_YEARS} лет`);

export const saveProfileSchema = z
  .object({
    sex: z.enum(SEXES),
    birthDate,
    heightCm: z.number().int().min(120, "Рост от 120 см").max(230, "Рост до 230 см"),
    weightKg: z.number().min(30, "Вес от 30 кг").max(300, "Вес до 300 кг"),
    activityLevel: z.enum(ACTIVITY_LEVELS),
    goal: z.enum(GOALS).default("lose"),
    deficitPercent: z.number().int().min(10).max(25).default(20),
    surplusPercent: z.number().int().min(5).max(15).default(10),
  })
  .strict();

/** Manual daily targets. `null` resets a target to the calculated value. */
export const updateTargetsSchema = z
  .object({
    kcal: z.number().int().min(800).max(6000).nullable(),
    proteinG: z.number().int().min(0).max(400).nullable(),
    fatG: z.number().int().min(0).max(300).nullable(),
    carbsG: z.number().int().min(0).max(800).nullable(),
  })
  .strict();

export type SaveProfileDto = z.infer<typeof saveProfileSchema>;
export type UpdateTargetsDto = z.infer<typeof updateTargetsSchema>;

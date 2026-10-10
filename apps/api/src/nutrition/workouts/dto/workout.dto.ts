import { z } from "zod";

const MAX_PAST_DAYS = 400;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
/** A realistic ceiling for one session; guards against a mistyped extra digit. */
export const MAX_WORKOUT_KCAL = 5000;
const MAX_MINUTES = 24 * 60;

const performedAt = z
  .string()
  .datetime({ offset: true })
  .refine((value) => {
    const time = new Date(value).getTime();
    const oldest = Date.now() - MAX_PAST_DAYS * 24 * 60 * 60 * 1000;
    return time >= oldest && time <= Date.now() + FUTURE_TOLERANCE_MS;
  }, "Время тренировки не может быть в будущем");

export const workoutSchema = z
  .object({
    performedAt,
    kcal: z
      .number()
      .int()
      .min(1, "Укажите калории")
      .max(MAX_WORKOUT_KCAL, "Слишком много для одной тренировки"),
    durationMin: z.number().int().min(1).max(MAX_MINUTES).nullable().default(null),
    note: z.string().trim().max(100).default(""),
  })
  .strict();

export type WorkoutDto = z.infer<typeof workoutSchema>;

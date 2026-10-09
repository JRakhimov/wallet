import { z } from "zod";

const MAX_PAST_DAYS = 400;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const eatenAt = z
  .string()
  .datetime({ offset: true })
  .refine((value) => {
    const time = new Date(value).getTime();
    const oldest = Date.now() - MAX_PAST_DAYS * 24 * 60 * 60 * 1000;
    return time >= oldest && time <= Date.now() + FUTURE_TOLERANCE_MS;
  }, "Время приёма пищи не может быть в будущем");

const comment = z.string().trim().max(1000).default("");

/** Text fields of the multipart analyze request; files come separately. */
export const analyzeMealSchema = z
  .object({ comment, eatenAt })
  .strict()
  .refine((value) => value.comment.length > 0, {
    message: "Опишите, что вы съели",
    path: ["comment"],
  });

/** Same as analyze, but a photo makes the comment optional. */
export const analyzePhotoMealSchema = z.object({ comment, eatenAt }).strict();

export const reanalyzeMealSchema = z
  .object({ clarification: z.string().trim().min(1, "Напишите уточнение").max(500) })
  .strict();

const grams = z.number().min(0).max(5000);
const nutrient = z.number().min(0).max(1000);

const mealItemSchema = z
  .object({
    name: z.string().trim().min(1, "Укажите название").max(120),
    grams: grams.refine((value) => value > 0, "Укажите вес"),
    kcal: z.number().min(0).max(10000),
    proteinG: nutrient,
    fatG: nutrient,
    carbsG: nutrient,
    confidence: z.enum(["low", "medium", "high"]).nullable().default(null),
  })
  .strict();

/** Saves the reviewed meal into the diary (or updates a saved one). */
export const saveMealSchema = z
  .object({
    eatenAt,
    comment,
    items: z.array(mealItemSchema).min(1, "Добавьте хотя бы одно блюдо").max(30),
  })
  .strict();

export type AnalyzeMealDto = z.infer<typeof analyzePhotoMealSchema>;
export type ReanalyzeMealDto = z.infer<typeof reanalyzeMealSchema>;
export type SaveMealDto = z.infer<typeof saveMealSchema>;
export type MealItemDto = z.infer<typeof mealItemSchema>;

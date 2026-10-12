import { DateTime } from "luxon";
import { z } from "zod";

export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 300;

export const weightSchema = z
  .object({
    date: z
      .string()
      .refine((value) => value.length === 10 && DateTime.fromISO(value).isValid, "Неверная дата"),
    weightKg: z
      .number()
      .min(MIN_WEIGHT_KG, `Вес от ${MIN_WEIGHT_KG} кг`)
      .max(MAX_WEIGHT_KG, `Вес до ${MAX_WEIGHT_KG} кг`),
  })
  .strict();

export type WeightDto = z.infer<typeof weightSchema>;

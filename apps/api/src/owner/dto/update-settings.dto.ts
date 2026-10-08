import { IANAZone } from "luxon";
import { z } from "zod";
import { label } from "../../common/validation/schemas";

export const updateSettingsSchema = z
  .object({
    name: label.optional(),
    timezone: z
      .string()
      .max(100)
      .refine((zone) => IANAZone.isValidZone(zone))
      .optional(),
    theme: z.enum(["system", "light", "dark"]).optional(),
  })
  .strict();

export type UpdateSettingsDto = z.infer<typeof updateSettingsSchema>;

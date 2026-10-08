import { z } from "zod";
import { label } from "../../common/validation/schemas";

// Icon names are chosen in the client (see apps/web/src/lib/category-icons.ts); unknown
// names render a fallback icon, so the API only checks the format.
const icon = z
  .string()
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Некорректная иконка");

export const createCategorySchema = z
  .object({
    name: label,
    kind: z.enum(["expense", "income"]).default("expense"),
    icon: icon.default("shapes"),
  })
  .strict();

export const updateCategorySchema = z
  .object({
    name: label.optional(),
    icon: icon.optional(),
    archived: z.boolean().optional(),
    favorite: z.boolean().optional(),
  })
  .strict();

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;

import { z } from "zod";
import { label } from "../../common/validation/schemas";

export const CATEGORY_ICONS = [
  "shopping-basket",
  "coffee",
  "car",
  "house",
  "shopping-bag",
  "heart-pulse",
  "popcorn",
  "repeat",
  "graduation-cap",
  "shapes",
  "briefcase-business",
  "circle-plus",
  "gift",
  "plane",
  "utensils",
] as const;

const icon = z.enum(CATEGORY_ICONS);

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

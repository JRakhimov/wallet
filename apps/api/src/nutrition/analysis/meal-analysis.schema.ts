import { z } from "zod/v4";

/**
 * Result every LLM provider must return. The JSON Schema below is generated from it and
 * passed to the provider's structured-output mode; the response is validated against it again.
 * Numeric limits are checked in `normalizeAnalysis`, not in the schema: not every provider
 * supports `minimum`/`maximum` in structured output.
 */
export const mealAnalysisSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        name: z.string().describe("Dish or product name in Russian, e.g. «Плов с говядиной»"),
        grams: z.number().describe("Estimated portion weight in grams"),
        kcal: z.number().describe("Calories of this portion"),
        proteinG: z.number().describe("Protein of this portion, grams"),
        fatG: z.number().describe("Fat of this portion, grams"),
        carbsG: z.number().describe("Carbohydrates of this portion, grams"),
        confidence: z.enum(["low", "medium", "high"]).describe("Confidence in the estimate"),
      }),
    )
    .describe("Every separately eaten dish, drink or product; empty if there is no food"),
  assumptions: z
    .array(z.string())
    .describe("Short assumptions in Russian, e.g. «масло при жарке ~10 г»"),
  questions: z
    .array(z.string())
    .describe("Short questions in Russian whose answers would make the estimate more accurate"),
});

export type MealAnalysis = z.infer<typeof mealAnalysisSchema>;
export type AnalyzedItem = MealAnalysis["items"][number];

function jsonSchema() {
  // Providers want the bare schema object, without the $schema dialect marker.
  const { $schema: _dialect, ...schema } = z.toJSONSchema(mealAnalysisSchema, {
    target: "draft-7",
  });
  return schema;
}

export const mealAnalysisJsonSchema: Record<string, unknown> = jsonSchema();

const MAX_ITEMS = 30;
const MAX_GRAMS = 5000;
const MAX_KCAL = 10000;
const MAX_NUTRIENT_G = 1000;

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/** Clamps numbers to sane ranges, rounds to 0.1 and drops empty items. */
export function normalizeAnalysis(analysis: MealAnalysis): MealAnalysis {
  const items = analysis.items
    .map((item) => ({
      ...item,
      name: item.name.trim().slice(0, 120),
      grams: oneDecimal(clamp(item.grams, MAX_GRAMS)),
      kcal: oneDecimal(clamp(item.kcal, MAX_KCAL)),
      proteinG: oneDecimal(clamp(item.proteinG, MAX_NUTRIENT_G)),
      fatG: oneDecimal(clamp(item.fatG, MAX_NUTRIENT_G)),
      carbsG: oneDecimal(clamp(item.carbsG, MAX_NUTRIENT_G)),
    }))
    .filter((item) => item.name && item.grams > 0)
    .slice(0, MAX_ITEMS);

  const texts = (values: string[]) =>
    values
      .map((value) => value.trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 10);

  return { items, assumptions: texts(analysis.assumptions), questions: texts(analysis.questions) };
}

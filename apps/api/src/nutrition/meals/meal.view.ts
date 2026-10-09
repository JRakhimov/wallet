import { Meal, MealItem, Prisma } from "@prisma/client";

export type MealWithItems = Meal & { items: MealItem[] };

/** What the LLM said besides the items; stored in Meal.analysis. */
export type StoredAnalysis = {
  assumptions: string[];
  questions: string[];
  clarifications: string[];
  meta: { provider: string; model: string; inputTokens: number; outputTokens: number }[];
};

export type Totals = { kcal: number; proteinG: number; fatG: number; carbsG: number };

const number = (value: Prisma.Decimal) => value.toNumber();
const oneDecimal = (value: number) => Math.round(value * 10) / 10;

export function sumTotals(items: Totals[]): Totals {
  const total = (key: keyof Totals) => oneDecimal(items.reduce((sum, item) => sum + item[key], 0));
  return {
    kcal: total("kcal"),
    proteinG: total("proteinG"),
    fatG: total("fatG"),
    carbsG: total("carbsG"),
  };
}

export function mealView(meal: MealWithItems) {
  const analysis = meal.analysis as StoredAnalysis | null;
  return {
    id: meal.id,
    eatenAt: meal.eatenAt.toISOString(),
    source: meal.source,
    status: meal.status,
    error: meal.error ?? "",
    comment: meal.comment,
    photoId: meal.photoId,
    totals: {
      kcal: number(meal.kcal),
      proteinG: number(meal.proteinG),
      fatG: number(meal.fatG),
      carbsG: number(meal.carbsG),
    },
    items: [...meal.items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        name: item.name,
        grams: number(item.grams),
        kcal: number(item.kcal),
        proteinG: number(item.proteinG),
        fatG: number(item.fatG),
        carbsG: number(item.carbsG),
        confidence: item.confidence,
      })),
    assumptions: analysis?.assumptions ?? [],
    questions: analysis?.questions ?? [],
  };
}

export type MealView = ReturnType<typeof mealView>;

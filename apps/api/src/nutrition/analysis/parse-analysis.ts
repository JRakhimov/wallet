import { MealAnalysis, mealAnalysisSchema, normalizeAnalysis } from "./meal-analysis.schema";
import { MealAnalysisError } from "./meal-analyzer";

/** Parses a provider's JSON text with the shared schema; every adapter ends with this. */
export function parseAnalysis(text: string | undefined | null): MealAnalysis {
  if (!text) {
    throw new MealAnalysisError("Модель не вернула результат. Попробуйте ещё раз");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new MealAnalysisError("Модель вернула некорректный ответ. Попробуйте ещё раз");
  }
  const result = mealAnalysisSchema.safeParse(json);
  if (!result.success) {
    throw new MealAnalysisError("Модель вернула некорректный ответ. Попробуйте ещё раз");
  }
  return normalizeAnalysis(result.data);
}

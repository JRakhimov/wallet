import { LlmProvider } from "../../config/app-config";
import { MealAnalysis } from "./meal-analysis.schema";

export type MealAnalysisInput = {
  /** What the owner wrote: dish names, portion hints, or the whole meal in text mode. */
  comment: string;
  /** Compressed JPEG of the meal; absent in text mode. */
  photo?: Buffer;
  /** Correction for a repeated analysis, e.g. «порция в два раза больше». */
  clarification?: string;
  /** Result being corrected, so the model adjusts it instead of starting over. */
  previous?: MealAnalysis;
};

export type MealAnalysisMeta = {
  provider: LlmProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type MealAnalysisResult = MealAnalysis & { meta: MealAnalysisMeta };

/**
 * Recognizes food in a photo and/or text. One implementation per LLM provider
 * (providers/*.analyzer.ts); the rest of the app depends only on this interface.
 */
export interface MealAnalyzer {
  analyze(input: MealAnalysisInput): Promise<MealAnalysisResult>;
}

/** DI token; null is injected when no provider is configured. */
export const MEAL_ANALYZER = Symbol("MEAL_ANALYZER");

/** Failure with a message that can be shown to the owner as is. */
export class MealAnalysisError extends Error {}

/** Owner-facing message for an HTTP error from any provider. */
export function providerErrorMessage(status: number | undefined) {
  if (status === 401 || status === 403) {
    return "Ключ API для распознавания недействителен. Проверьте настройки сервера";
  }
  if (status === 429) {
    return "Слишком много запросов к модели. Попробуйте через минуту";
  }
  if (status !== undefined && status >= 500) {
    return "Сервис распознавания временно недоступен. Попробуйте ещё раз";
  }
  return "Не удалось распознать еду. Попробуйте ещё раз";
}

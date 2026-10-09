import { ApiError, GoogleGenAI, Part } from "@google/genai";
import { LlmConfig } from "../../../config/app-config";
import { mealAnalysisJsonSchema } from "../meal-analysis.schema";
import { MEAL_ANALYSIS_SYSTEM_PROMPT, mealAnalysisUserText } from "../meal-analysis.prompt";
import {
  MealAnalysisError,
  MealAnalysisInput,
  MealAnalysisResult,
  MealAnalyzer,
  providerErrorMessage,
} from "../meal-analyzer";
import { parseAnalysis } from "../parse-analysis";

const TIMEOUT_MS = 60_000;

/** Google Gemini via the official `@google/genai` SDK (JSON output with a response schema). */
export class GeminiAnalyzer implements MealAnalyzer {
  private readonly client: GoogleGenAI;

  constructor(private readonly config: LlmConfig) {
    this.client = new GoogleGenAI({
      apiKey: config.apiKey,
      httpOptions: { timeout: TIMEOUT_MS },
    });
  }

  async analyze(input: MealAnalysisInput): Promise<MealAnalysisResult> {
    const parts: Part[] = [];
    if (input.photo) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: input.photo.toString("base64") } });
    }
    parts.push({ text: mealAnalysisUserText(input) });

    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.config.model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: MEAL_ANALYSIS_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema: mealAnalysisJsonSchema,
        },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw new MealAnalysisError(providerErrorMessage(error.status));
      }
      throw error;
    }

    const usage = response.usageMetadata;
    return {
      ...parseAnalysis(response.text),
      meta: {
        provider: "gemini",
        model: response.modelVersion ?? this.config.model,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
      },
    };
  }
}

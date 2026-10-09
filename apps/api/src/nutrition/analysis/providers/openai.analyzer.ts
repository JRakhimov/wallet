import OpenAI from "openai";
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

/** OpenAI via the official `openai` SDK (Responses API with a strict JSON schema). */
export class OpenAiAnalyzer implements MealAnalyzer {
  private readonly client: OpenAI;

  constructor(private readonly config: LlmConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey, timeout: TIMEOUT_MS, maxRetries: 2 });
  }

  async analyze(input: MealAnalysisInput): Promise<MealAnalysisResult> {
    const content: OpenAI.Responses.ResponseInputContent[] = [];
    if (input.photo) {
      content.push({
        type: "input_image",
        image_url: `data:image/jpeg;base64,${input.photo.toString("base64")}`,
        detail: "high",
      });
    }
    content.push({ type: "input_text", text: mealAnalysisUserText(input) });

    let response: OpenAI.Responses.Response;
    try {
      response = await this.client.responses.create({
        model: this.config.model,
        instructions: MEAL_ANALYSIS_SYSTEM_PROMPT,
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "meal_analysis",
            schema: mealAnalysisJsonSchema,
            strict: true,
          },
        },
      });
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new MealAnalysisError(providerErrorMessage(error.status));
      }
      throw error;
    }

    if (response.status === "incomplete") {
      throw new MealAnalysisError("Модель не закончила ответ. Попробуйте ещё раз");
    }

    return {
      ...parseAnalysis(response.output_text),
      meta: {
        provider: "openai",
        model: response.model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
    };
  }
}

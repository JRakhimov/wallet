import Anthropic from "@anthropic-ai/sdk";
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
const MAX_TOKENS = 16_000;
// Server-side fallback: if the model declines, the API re-runs the request on another model.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Anthropic Claude via @anthropic-ai/sdk. */
export class ClaudeAnalyzer implements MealAnalyzer {
  private readonly client: Anthropic;

  constructor(private readonly config: LlmConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey, timeout: TIMEOUT_MS, maxRetries: 2 });
  }

  async analyze(input: MealAnalysisInput): Promise<MealAnalysisResult> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (input.photo) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: input.photo.toString("base64") },
      });
    }
    content.push({ type: "text", text: mealAnalysisUserText(input) });

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.config.model,
        max_tokens: MAX_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        system: MEAL_ANALYSIS_SYSTEM_PROMPT,
        // Effort is the only depth control on current models; medium is enough for food estimates.
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: mealAnalysisJsonSchema },
        },
        messages: [{ role: "user", content }],
      });
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new MealAnalysisError(providerErrorMessage(error.status));
      }
      throw error;
    }

    if (response.stop_reason === "refusal") {
      throw new MealAnalysisError("Модель отказалась анализировать этот запрос");
    }
    if (response.stop_reason === "max_tokens") {
      throw new MealAnalysisError("Ответ модели оказался слишком длинным. Попробуйте ещё раз");
    }
    const text = response.content.find((block) => block.type === "text");

    return {
      ...parseAnalysis(text?.type === "text" ? text.text : null),
      meta: {
        provider: "claude",
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

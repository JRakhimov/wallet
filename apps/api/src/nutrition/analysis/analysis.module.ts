import { Logger, Module } from "@nestjs/common";
import { AppConfig, CONFIG, LlmConfig, LlmProvider } from "../../config/app-config";
import { MEAL_ANALYZER, MealAnalyzer } from "./meal-analyzer";
import { ClaudeAnalyzer } from "./providers/claude.analyzer";
import { GeminiAnalyzer } from "./providers/gemini.analyzer";
import { OpenAiAnalyzer } from "./providers/openai.analyzer";

/** Adding a provider: a new file in providers/ and one line here. */
const ANALYZERS: Record<LlmProvider, new (config: LlmConfig) => MealAnalyzer> = {
  claude: ClaudeAnalyzer,
  gemini: GeminiAnalyzer,
  openai: OpenAiAnalyzer,
};

function createAnalyzer(config: AppConfig): MealAnalyzer | null {
  const llm = config.nutrition.llm;
  if (!llm) {
    Logger.warn("Meal recognition is disabled: no LLM API key is set", "AnalysisModule");
    return null;
  }
  Logger.log(`Meal recognition: ${llm.provider} (${llm.model})`, "AnalysisModule");
  return new ANALYZERS[llm.provider](llm);
}

/** Provides MEAL_ANALYZER for the provider chosen by NUTRITION_LLM_PROVIDER. */
@Module({
  providers: [{ provide: MEAL_ANALYZER, useFactory: createAnalyzer, inject: [CONFIG] }],
  exports: [MEAL_ANALYZER],
})
export class AnalysisModule {}

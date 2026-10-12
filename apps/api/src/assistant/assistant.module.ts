import { Logger, Module } from "@nestjs/common";
import { AppConfig, CONFIG } from "../config/app-config";
import { MealsModule } from "../nutrition/meals/meals.module";
import { ProfileModule } from "../nutrition/profile/profile.module";
import { WeightModule } from "../nutrition/weight/weight.module";
import { WorkoutsModule } from "../nutrition/workouts/workouts.module";
import { OwnerModule } from "../owner/owner.module";
import { TasksModule } from "../tasks/tasks.module";
import { VoiceModule } from "../voice/voice.module";
import { AccountsModule } from "../wallet/accounts/accounts.module";
import { BudgetsModule } from "../wallet/budgets/budgets.module";
import { CategoriesModule } from "../wallet/categories/categories.module";
import { OperationsModule } from "../wallet/operations/operations.module";
import { ReportsModule } from "../wallet/reports/reports.module";
import { SubscriptionsModule } from "../wallet/subscriptions/subscriptions.module";
import { ActionsService } from "./actions.service";
import { ASSISTANT_MODEL, OpenAiAssistantModel } from "./assistant-model";
import { AssistantService } from "./assistant.service";
import { BriefingComposer } from "./briefing";
import { HistoryService } from "./history.service";
import { MemoryService } from "./memory.service";
import { AssistantSettingsService } from "./settings.service";
import { AssistantToolbox } from "./tools/toolbox";

function createModel(config: AppConfig) {
  if (!config.assistant) {
    Logger.warn("The assistant is disabled: OPENAI_API_KEY is not set", "AssistantModule");
    return null;
  }

  Logger.log(`Assistant: ${config.assistant.model}`, "AssistantModule");

  return new OpenAiAssistantModel(config.assistant);
}

/** The assistant in the bot chat: a language model with tools over every app. */
@Module({
  imports: [
    OwnerModule,
    VoiceModule,
    AccountsModule,
    CategoriesModule,
    OperationsModule,
    ReportsModule,
    SubscriptionsModule,
    BudgetsModule,
    MealsModule,
    WorkoutsModule,
    WeightModule,
    ProfileModule,
    TasksModule,
  ],
  providers: [
    { provide: ASSISTANT_MODEL, useFactory: createModel, inject: [CONFIG] },
    AssistantService,
    AssistantToolbox,
    ActionsService,
    HistoryService,
    MemoryService,
    AssistantSettingsService,
    BriefingComposer,
  ],
  exports: [AssistantService, AssistantSettingsService, BriefingComposer],
})
export class AssistantModule {}

import { Injectable } from "@nestjs/common";
import { MealsService } from "../../nutrition/meals/meals.service";
import { ProfileService } from "../../nutrition/profile/profile.service";
import { WeightService } from "../../nutrition/weight/weight.service";
import { WorkoutsService } from "../../nutrition/workouts/workouts.service";
import { TasksService } from "../../tasks/tasks.service";
import { AccountsService } from "../../wallet/accounts/accounts.service";
import { BudgetsService } from "../../wallet/budgets/budgets.service";
import { CategoriesService } from "../../wallet/categories/categories.service";
import { OperationsService } from "../../wallet/operations/operations.service";
import { ReportsService } from "../../wallet/reports/reports.service";
import { SubscriptionsService } from "../../wallet/subscriptions/subscriptions.service";
import { ToolSpec } from "../assistant-model";
import { MemoryService } from "../memory.service";
import { AssistantSettingsService } from "../settings.service";
import { WeatherService } from "../weather.service";
import { MemoryDeps, memoryTools } from "./memory.tools";
import { NutritionDeps, nutritionTools } from "./nutrition.tools";
import { OverviewDeps, overviewTools } from "./overview.tools";
import { TasksDeps, tasksTools } from "./tasks.tools";
import { ActionHandler, AssistantTool, toolSpec } from "./tool";
import { WalletDeps, walletTools } from "./wallet.tools";
import { WeatherDeps, weatherTools } from "./weather.tools";

export type ToolboxDeps = OverviewDeps &
  WalletDeps &
  NutritionDeps &
  TasksDeps &
  MemoryDeps &
  WeatherDeps;

export type Tools = {
  tools: Map<string, AssistantTool>;
  /** For the model, always in the same order so the prompt prefix stays cacheable. */
  specs: ToolSpec[];
  actions: Map<string, ActionHandler>;
};

/** Every tool of every app and the handlers of the buttons they offer. */
export function buildTools(deps: ToolboxDeps): Tools {
  const sets = [
    overviewTools(deps),
    walletTools(deps),
    nutritionTools(deps),
    tasksTools(deps),
    memoryTools(deps),
    weatherTools(deps),
  ];
  const tools = sets.flatMap((set) => set.tools);

  return {
    tools: new Map(tools.map((tool) => [tool.name, tool])),
    specs: tools.map(toolSpec),
    actions: new Map(sets.flatMap((set) => Object.entries(set.actions))),
  };
}

/** The tools wired to the app's services. */
@Injectable()
export class AssistantToolbox {
  readonly tools: Tools;

  constructor(
    accounts: AccountsService,
    categories: CategoriesService,
    operations: OperationsService,
    reports: ReportsService,
    subscriptions: SubscriptionsService,
    budgets: BudgetsService,
    meals: MealsService,
    workouts: WorkoutsService,
    weight: WeightService,
    profile: ProfileService,
    tasks: TasksService,
    memory: MemoryService,
    settings: AssistantSettingsService,
    weather: WeatherService,
  ) {
    this.tools = buildTools({
      accounts,
      categories,
      operations,
      reports,
      subscriptions,
      budgets,
      meals,
      workouts,
      weight,
      profile,
      tasks,
      memory,
      settings,
      weather,
    });
  }
}

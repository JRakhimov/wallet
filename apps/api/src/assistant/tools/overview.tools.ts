import { z } from "zod/v4";
import { MealsService } from "../../nutrition/meals/meals.service";
import { ProfileService } from "../../nutrition/profile/profile.service";
import { WeightService } from "../../nutrition/weight/weight.service";
import { TasksService } from "../../tasks/tasks.service";
import { AccountsService } from "../../wallet/accounts/accounts.service";
import { ReportsService } from "../../wallet/reports/reports.service";
import { SubscriptionsService } from "../../wallet/subscriptions/subscriptions.service";
import { compactTask, groupTasks } from "./tasks.tools";
import { defineTool, Toolset } from "./tool";

export type OverviewDeps = {
  accounts: Pick<AccountsService, "list">;
  reports: Pick<ReportsService, "summary">;
  subscriptions: Pick<SubscriptionsService, "list">;
  tasks: Pick<TasksService, "list">;
  meals: Pick<MealsService, "day">;
  profile: Pick<ProfileService, "get">;
  weight: Pick<WeightService, "list">;
};

/** Subscriptions charged within this many days count as coming soon. */
const SOON_DAYS = 3;

/** One call for "как у меня дела?": a little of everything as of now. */
export function overviewTools(deps: OverviewDeps): Toolset {
  return { tools: [getOverview(deps)], actions: {} };
}

function getOverview(deps: OverviewDeps) {
  return defineTool({
    name: "get_overview",
    progress: "Смотрю, как дела…",
    description:
      "A snapshot of everything as of now: account balances, this month's spending, income and budget, subscriptions charged soon, overdue and today's tasks, calories eaten today against the target, current weight. Use it for general questions and when unsure where to look.",
    parameters: z.strictObject({}),

    async run(context) {
      const { ownerId, now } = context;
      const today = now.toISODate()!;

      const [accounts, month, subscriptions, tasks, day, profile, weight] = await Promise.all([
        deps.accounts.list(ownerId),
        deps.reports.summary(ownerId, now.toFormat("yyyy-MM")),
        deps.subscriptions.list(ownerId),
        deps.tasks.list(ownerId),
        deps.meals.day(ownerId, today),
        deps.profile.get(ownerId),
        deps.weight.list(ownerId),
      ]);

      const groups = groupTasks(tasks, now);

      return {
        accounts: accounts
          .filter((account) => !account.archived)
          .map(({ name, currency, balance }) => ({ name, currency, balance })),
        month: {
          month: month.month,
          spent: month.netExpense,
          income: month.income,
          budget: month.budget,
          remaining: month.remaining,
        },
        subscriptionsSoon: subscriptions.filter((item) => item.daysLeft <= SOON_DAYS),
        tasks: {
          overdue: groups.overdue.map((task) => compactTask(task, now)),
          today: groups.today.map((task) => compactTask(task, now)),
          upcomingCount: groups.upcoming.length,
          notesCount: groups.notes.length,
        },
        nutrition: profile && {
          eatenKcal: day.totals.kcal,
          targetKcal: profile.targets.kcal,
          leftKcal: Math.round(profile.targets.kcal - day.totals.kcal),
          meals: day.meals.length,
          burnedKcal: day.burnedKcal,
        },
        weight: { current: weight.current, change7: weight.change7 },
      };
    },
  });
}

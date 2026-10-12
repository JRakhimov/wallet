import { DateTime } from "luxon";
import { z } from "zod/v4";
import { month as monthSchema, positiveMoney } from "../../common/validation/schemas";
import { AccountsService } from "../../wallet/accounts/accounts.service";
import { BudgetsService } from "../../wallet/budgets/budgets.service";
import { CategoriesService } from "../../wallet/categories/categories.service";
import { BASE_CURRENCY } from "../../wallet/currency";
import { OperationDto, operationSchema } from "../../wallet/operations/dto/operation.dto";
import { operationView } from "../../wallet/operations/operation.view";
import { OperationsService } from "../../wallet/operations/operations.service";
import { ReportsService } from "../../wallet/reports/reports.service";
import {
  createSubscriptionSchema,
  UpdateSubscriptionDto,
  updateSubscriptionSchema,
} from "../../wallet/subscriptions/dto/subscription.dto";
import { SubscriptionsService } from "../../wallet/subscriptions/subscriptions.service";
import { dayLabel, formatMoney, formatMoneyIn, monthLabel } from "../format";
import {
  checkId,
  defineAction,
  defineTool,
  fields,
  monthOf,
  pastMoment,
  ToolContext,
  ToolError,
  Toolset,
  validate,
} from "./tool";

export type WalletDeps = {
  accounts: Pick<AccountsService, "list">;
  categories: Pick<CategoriesService, "list">;
  operations: Pick<OperationsService, "list" | "totals" | "get" | "create" | "update" | "remove">;
  reports: Pick<ReportsService, "summary" | "insights">;
  subscriptions: Pick<SubscriptionsService, "list" | "create" | "update" | "remove">;
  budgets: Pick<BudgetsService, "set">;
};

type OperationView = ReturnType<typeof operationView>;
type MoneyKind = "expense" | "income";

const MAX_AMOUNT = 999_999_999_999;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_NOTE = 200;

const KIND_LABELS: Record<MoneyKind, string> = { expense: "Расход", income: "Доход" };
const KIND_WORDS: Record<string, string> = {
  expense: "расход",
  income: "доход",
  transfer: "перевод",
  refund: "возврат",
  adjustment: "корректировка",
  opening: "начальный остаток",
};
const OPERATION_KINDS = [
  "expense",
  "income",
  "transfer",
  "refund",
  "adjustment",
  "opening",
] as const;

/** Accounts, operations, reports, budgets and subscriptions of the wallet. */
export function walletTools(deps: WalletDeps): Toolset {
  return {
    tools: [
      listAccountsAndCategories(deps),
      monthSummary(deps),
      spendingInsights(deps),
      findOperations(deps),
      listSubscriptions(deps),
      addOperation(deps),
      addTransfer(deps),
      updateOperation(deps),
      deleteOperation(deps),
      setBudget(deps),
      addSubscription(deps),
      updateSubscription(deps),
      deleteSubscription(deps),
    ],
    actions: walletActions(deps),
  };
}

function walletActions(deps: WalletDeps) {
  return {
    undo_operation: defineAction<{ id: string; version: number }>(async (ownerId, payload) => {
      await deps.operations.remove(ownerId, payload.id, payload.version);

      return "↩️ Запись отменена";
    }),

    update_operation: defineAction<{ id: string; version: number; input: OperationDto }>(
      async (ownerId, payload) => {
        await deps.operations.update(ownerId, payload.id, payload.input, payload.version);

        return "✅ Изменено";
      },
    ),

    delete_operation: defineAction<{ id: string; version: number }>(async (ownerId, payload) => {
      await deps.operations.remove(ownerId, payload.id, payload.version);

      return "🗑 Удалено";
    }),

    set_budget: defineAction<{ month: string; amount: string }>(async (ownerId, payload) => {
      const budget = await deps.budgets.set(ownerId, payload.month, payload.amount);

      return `✅ Бюджет на ${monthLabel(budget.month)}: ${formatMoney(budget.amount)} сум`;
    }),

    undo_subscription: defineAction<{ id: string }>(async (ownerId, payload) => {
      await deps.subscriptions.remove(ownerId, payload.id);

      return "↩️ Подписка удалена";
    }),

    update_subscription: defineAction<{ id: string; input: UpdateSubscriptionDto }>(
      async (ownerId, payload) => {
        await deps.subscriptions.update(ownerId, payload.id, payload.input);

        return "✅ Подписка изменена";
      },
    ),

    delete_subscription: defineAction<{ id: string }>(async (ownerId, payload) => {
      await deps.subscriptions.remove(ownerId, payload.id);

      return "🗑 Подписка удалена";
    }),
  };
}

function listAccountsAndCategories(deps: WalletDeps) {
  return defineTool({
    name: "list_accounts_and_categories",
    progress: "Смотрю счета и категории…",
    description:
      "Active wallet accounts with balances and categories of expenses and income. Call it before recording money to pick the account and the category ids.",
    parameters: z.strictObject({}),

    async run(context) {
      const [accounts, categories] = await Promise.all([
        deps.accounts.list(context.ownerId),
        deps.categories.list(context.ownerId),
      ]);

      return {
        accounts: accounts
          .filter((account) => !account.archived)
          .map(({ id, name, kind, currency, balance }) => ({ id, name, kind, currency, balance })),
        categories: categories
          .filter((category) => !category.archived)
          .map(({ id, name, kind, favorite }) => ({ id, name, kind, favorite })),
      };
    },
  });
}

function monthSummary(deps: WalletDeps) {
  return defineTool({
    name: "month_summary",
    progress: "Считаю итоги месяца…",
    description:
      "Totals of a month in сум: spending (net of refunds), income, budget and what is left of it, spending by category and by day. Operations on dollar accounts are not included.",
    parameters: z.strictObject({ month: fields.month }),

    async run(context, args) {
      const summary = await deps.reports.summary(context.ownerId, monthOf(context, args.month));

      return {
        ...summary,
        categories: summary.categories.map(({ id, name, value }) => ({ id, name, value })),
      };
    },
  });
}

function spendingInsights(deps: WalletDeps) {
  return defineTool({
    name: "spending_insights",
    progress: "Анализирую траты…",
    description:
      "Spending patterns of a month in сум: last days against the usual, weeks, weekdays against weekends, change by category against previous months, forecast for the month, the biggest purchase, what is bought most often.",
    parameters: z.strictObject({ month: fields.month }),

    async run(context, args) {
      return deps.reports.insights(context.ownerId, monthOf(context, args.month));
    },
  });
}

function findOperations(deps: WalletDeps) {
  return defineTool({
    name: "find_operations",
    progress: "Ищу операции…",
    description:
      "Searches wallet operations, newest first, with the count and the totals of everything that matched (not only the shown page). Use from/to for days and weeks, month for a whole month; with none of them it searches the current month. Amounts are in the currency of each operation.",
    parameters: z.strictObject({
      month: fields.month,
      from: z.string().nullable().describe("First day, yyyy-MM-dd; replaces month"),
      to: z.string().nullable().describe("Last day, yyyy-MM-dd, inclusive; replaces month"),
      kind: z.enum(OPERATION_KINDS).nullable(),
      categoryId: z.string().nullable(),
      accountId: z.string().nullable(),
      text: z.string().nullable().describe("Words to find in the note or the category name"),
      limit: z.number().nullable().describe(`How many to show, up to ${MAX_LIMIT}`),
    }),

    async run(context, args) {
      const filter = {
        month: args.month ?? undefined,
        from: args.from ?? undefined,
        to: args.to ?? undefined,
        kind: args.kind ?? undefined,
        categoryId: args.categoryId ? checkId(args.categoryId, "категория") : undefined,
        accountId: args.accountId ? checkId(args.accountId, "счёт") : undefined,
        q: args.text?.trim().slice(0, 100) || undefined,
      };
      const limit = Math.min(Math.max(Math.round(args.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);

      const [page, totals] = await Promise.all([
        deps.operations.list(context.ownerId, filter, limit),
        deps.operations.totals(context.ownerId, filter),
      ]);

      return {
        count: page.count,
        shown: page.items.length,
        totals,
        items: page.items.map((operation) => compactOperation(operation, context.timezone)),
      };
    },
  });
}

function listSubscriptions(deps: WalletDeps) {
  return defineTool({
    name: "list_subscriptions",
    progress: "Смотрю подписки…",
    description:
      "Monthly subscriptions in сум with the day of the charge and the next charge date.",
    parameters: z.strictObject({}),

    async run(context) {
      return deps.subscriptions.list(context.ownerId);
    },
  });
}

function addOperation(deps: WalletDeps) {
  return defineTool({
    name: "add_operation",
    progress: "Записываю…",
    description:
      "Records an expense or an income right away (the user can undo it with a button). The amount is in the account's currency. Without accountId the first account in сум is used.",
    parameters: z.strictObject({
      kind: z.enum(["expense", "income"]),
      amount: z.number().describe("Positive number in the account's currency, e.g. 45000"),
      categoryId: z.string().nullable().describe("Id of a category of the same kind"),
      accountId: z.string().nullable().describe("null for the main account in сум"),
      note: fields.note,
      date: fields.date,
      time: fields.time,
    }),

    async run(context, args) {
      const account = await pickAccount(deps, context, args.accountId);
      const category = await pickCategory(deps, context, args.categoryId, args.kind);
      const amount = moneyString(args.amount);
      const note = args.note.trim().slice(0, MAX_NOTE);
      const occurredAt = pastMoment(context, args.date, args.time);

      const input = validate(operationSchema, {
        kind: args.kind,
        amount,
        accountId: account.id,
        categoryId: category.id,
        note,
        occurredAt: occurredAt.toISO(),
      });

      const operation = await deps.operations.create(context.ownerId, input, context.nextKey());

      const purpose = note ? ` за ${note}` : "";
      const day = occurredAt.hasSame(context.now, "day")
        ? ""
        : ` · ${dayLabel(operation.localDate!, context.now)}`;
      const recorded = `${KIND_LABELS[args.kind]} ${formatMoneyIn(amount, account.currency)}${purpose} записан · ${category.name}${day}`;

      context.recorded.push(recorded);
      context.offer({
        kind: "undo",
        action: "undo_operation",
        payload: { id: operation.id, version: operation.version },
        summary: recorded,
        label: `${formatMoneyIn(amount, account.currency)}${purpose}`,
      });

      return { recorded, operationId: operation.id };
    },
  });
}

function addTransfer(deps: WalletDeps) {
  return defineTool({
    name: "add_transfer",
    progress: "Записываю перевод…",
    description:
      "Records a transfer between two of the user's accounts right away. Between accounts in different currencies a rate is required: сум for 1 $.",
    parameters: z.strictObject({
      fromAccountId: z.string(),
      toAccountId: z.string(),
      amount: z.number().describe("Positive number in the currency of the source account"),
      rate: z.number().nullable().describe("сум for 1 $; only between currencies"),
      note: z.string(),
      date: fields.date,
      time: fields.time,
    }),

    async run(context, args) {
      const from = await pickAccount(deps, context, args.fromAccountId);
      const to = await pickAccount(deps, context, args.toAccountId);
      const amount = moneyString(args.amount);
      const occurredAt = pastMoment(context, args.date, args.time);

      const input = validate(operationSchema, {
        kind: "transfer",
        amount,
        accountId: from.id,
        targetAccountId: to.id,
        ...(args.rate !== null && { rate: String(Math.round(args.rate * 1e6) / 1e6) }),
        note: args.note.trim().slice(0, MAX_NOTE),
        occurredAt: occurredAt.toISO(),
      });

      const operation = await deps.operations.create(context.ownerId, input, context.nextKey());
      const recorded = `Перевод ${formatMoneyIn(amount, from.currency)} с «${from.name}» на «${to.name}» записан`;

      context.recorded.push(recorded);
      context.offer({
        kind: "undo",
        action: "undo_operation",
        payload: { id: operation.id, version: operation.version },
        summary: recorded,
        label: `перевод ${formatMoneyIn(amount, from.currency)}`,
      });

      return { recorded, operationId: operation.id };
    },
  });
}

function updateOperation(deps: WalletDeps) {
  return defineTool({
    name: "update_operation",
    progress: "Готовлю изменение…",
    description:
      "Changes an expense or an income found with find_operations. Nothing changes until the user taps «Подтвердить» under your answer. Pass null for what stays the same.",
    parameters: z.strictObject({
      operationId: z.string(),
      amount: z.number().nullable(),
      categoryId: z.string().nullable(),
      note: z.string().nullable(),
      date: fields.date,
      time: fields.time,
    }),

    async run(context, args) {
      const current = await deps.operations.get(
        context.ownerId,
        checkId(args.operationId, "операция"),
      );
      if (current.kind !== "expense" && current.kind !== "income") {
        throw new ToolError("Изменить можно только расход или доход. Остальное — в приложении");
      }

      const kind = current.kind as MoneyKind;
      const category = args.categoryId
        ? await pickCategory(deps, context, args.categoryId, kind)
        : current.category;
      const occurredAt = changedMoment(context, current, args.date, args.time);

      const input = validate(operationSchema, {
        kind,
        amount: args.amount === null ? current.amount : moneyString(args.amount),
        accountId: current.entries[0].accountId,
        categoryId: category?.id,
        note: args.note === null ? current.note : args.note.trim().slice(0, MAX_NOTE),
        occurredAt: occurredAt.toISO(),
      });

      const before = operationLine(current, context.now);
      const after = operationLine(
        {
          ...current,
          amount: input.amount,
          category: category ?? null,
          note: input.note,
          localDate: occurredAt.toISODate(),
        },
        context.now,
      );
      const summary = `Изменить ${before} → ${after}?`;

      context.offer({
        kind: "confirm",
        action: "update_operation",
        payload: { id: current.id, version: current.version, input },
        summary,
        label: `изменить ${KIND_WORDS[kind]}`,
      });

      return { status: "waiting_for_confirmation", summary };
    },
  });
}

function deleteOperation(deps: WalletDeps) {
  return defineTool({
    name: "delete_operation",
    progress: "Готовлю удаление…",
    description:
      "Deletes an operation found with find_operations. Nothing is deleted until the user taps «Подтвердить» under your answer.",
    parameters: z.strictObject({ operationId: z.string() }),

    async run(context, args) {
      const operation = await deps.operations.get(
        context.ownerId,
        checkId(args.operationId, "операция"),
      );
      const summary = `Удалить ${operationLine(operation, context.now)}?`;

      context.offer({
        kind: "confirm",
        action: "delete_operation",
        payload: { id: operation.id, version: operation.version },
        summary,
        label: `удалить ${KIND_WORDS[operation.kind] ?? "операцию"}`,
      });

      return { status: "waiting_for_confirmation", summary };
    },
  });
}

function setBudget(deps: WalletDeps) {
  return defineTool({
    name: "set_budget",
    progress: "Готовлю бюджет…",
    description:
      "Sets the spending budget of a month in сум. Nothing changes until the user taps «Подтвердить».",
    parameters: z.strictObject({ month: fields.month, amount: z.number() }),

    async run(context, args) {
      const month = validate(monthSchema, monthOf(context, args.month));
      const amount = validate(positiveMoney, moneyString(args.amount));
      const { budget } = await deps.reports.summary(context.ownerId, month);

      const current = budget ? ` (сейчас ${formatMoney(budget)} сум)` : "";
      const summary = `Установить бюджет на ${monthLabel(month)}: ${formatMoney(amount)} сум${current}?`;

      context.offer({
        kind: "confirm",
        action: "set_budget",
        payload: { month, amount },
        summary,
        label: "бюджет",
      });

      return { status: "waiting_for_confirmation", summary };
    },
  });
}

function addSubscription(deps: WalletDeps) {
  return defineTool({
    name: "add_subscription",
    progress: "Добавляю подписку…",
    description:
      "Adds a monthly subscription in сум right away; the bot reminds about its charges.",
    parameters: z.strictObject({
      name: z.string(),
      amount: z.number(),
      chargeDay: z.number().describe("Day of the month it is charged, 1-31"),
    }),

    async run(context, args) {
      const input = validate(createSubscriptionSchema, {
        name: args.name,
        amount: moneyString(args.amount),
        chargeDay: Math.round(args.chargeDay),
      });

      const subscription = await deps.subscriptions.create(context.ownerId, input);
      const recorded = `Подписка «${subscription.name}» ${formatMoney(subscription.amount)} сум добавлена, списание ${subscription.chargeDay}-го числа`;

      context.recorded.push(recorded);
      context.offer({
        kind: "undo",
        action: "undo_subscription",
        payload: { id: subscription.id },
        summary: recorded,
        label: subscription.name,
      });

      return { recorded, subscriptionId: subscription.id };
    },
  });
}

function updateSubscription(deps: WalletDeps) {
  return defineTool({
    name: "update_subscription",
    progress: "Готовлю изменение…",
    description:
      "Changes a subscription from list_subscriptions. Nothing changes until the user taps «Подтвердить». Pass null for what stays the same.",
    parameters: z.strictObject({
      subscriptionId: z.string(),
      name: z.string().nullable(),
      amount: z.number().nullable(),
      chargeDay: z.number().nullable(),
    }),

    async run(context, args) {
      const subscription = await findSubscription(deps, context, args.subscriptionId);

      const input = validate(updateSubscriptionSchema, {
        ...(args.name !== null && { name: args.name }),
        ...(args.amount !== null && { amount: moneyString(args.amount) }),
        ...(args.chargeDay !== null && { chargeDay: Math.round(args.chargeDay) }),
      });

      const name = input.name ?? subscription.name;
      const amount = input.amount ?? subscription.amount;
      const chargeDay = input.chargeDay ?? subscription.chargeDay;
      const summary = `Изменить подписку «${subscription.name}»: ${name}, ${formatMoney(amount)} сум, списание ${chargeDay}-го?`;

      context.offer({
        kind: "confirm",
        action: "update_subscription",
        payload: { id: subscription.id, input },
        summary,
        label: subscription.name,
      });

      return { status: "waiting_for_confirmation", summary };
    },
  });
}

function deleteSubscription(deps: WalletDeps) {
  return defineTool({
    name: "delete_subscription",
    progress: "Готовлю удаление…",
    description:
      "Deletes a subscription from list_subscriptions. Nothing is deleted until the user taps «Подтвердить».",
    parameters: z.strictObject({ subscriptionId: z.string() }),

    async run(context, args) {
      const subscription = await findSubscription(deps, context, args.subscriptionId);
      const summary = `Удалить подписку «${subscription.name}» ${formatMoney(subscription.amount)} сум?`;

      context.offer({
        kind: "confirm",
        action: "delete_subscription",
        payload: { id: subscription.id },
        summary,
        label: subscription.name,
      });

      return { status: "waiting_for_confirmation", summary };
    },
  });
}

/** The given active account, or the first active one in сум. */
async function pickAccount(deps: WalletDeps, context: ToolContext, accountId: string | null) {
  const accounts = (await deps.accounts.list(context.ownerId)).filter(
    (account) => !account.archived,
  );

  if (accountId) {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) {
      throw new ToolError(
        "Счёт не найден среди активных. Возьмите id из list_accounts_and_categories",
      );
    }

    return account;
  }

  const main = accounts.find((account) => account.currency === BASE_CURRENCY);
  if (!main) {
    throw new ToolError("В кошельке нет активного счёта в сумах");
  }

  return main;
}

async function pickCategory(
  deps: WalletDeps,
  context: ToolContext,
  categoryId: string | null,
  kind: MoneyKind,
) {
  if (!categoryId) {
    throw new ToolError(
      "Нужна категория: выберите подходящую из list_accounts_and_categories или спросите пользователя",
    );
  }

  const categories = await deps.categories.list(context.ownerId);
  const category = categories.find((item) => item.id === categoryId && !item.archived);
  if (!category) {
    throw new ToolError("Категория не найдена. Возьмите id из list_accounts_and_categories");
  }

  if (category.kind !== kind) {
    throw new ToolError(
      `Категория «${category.name}» не подходит: нужна категория вида «${KIND_WORDS[kind]}»`,
    );
  }

  return category;
}

async function findSubscription(deps: WalletDeps, context: ToolContext, id: string) {
  const subscriptions = await deps.subscriptions.list(context.ownerId);
  const subscription = subscriptions.find((item) => item.id === id);
  if (!subscription) {
    throw new ToolError("Подписка не найдена. Возьмите id из list_subscriptions");
  }

  return subscription;
}

/** Money as the API stores it: "45000.00". */
function moneyString(amount: number) {
  const rounded = Math.round(amount * 100) / 100;
  if (!(rounded > 0) || rounded > MAX_AMOUNT) {
    throw new ToolError("Сумма должна быть больше нуля и меньше триллиона");
  }

  return rounded.toFixed(2);
}

/** The new moment of an operation: a new day keeps the time, a new time keeps the day. */
function changedMoment(
  context: ToolContext,
  current: OperationView,
  date: string | null,
  time: string | null,
) {
  const local = DateTime.fromISO(current.occurredAt).setZone(context.timezone);

  if (date === null && time === null) {
    return local;
  }

  return pastMoment(context, date ?? local.toISODate()!, time ?? local.toFormat("HH:mm"));
}

/** "расход 45 000 сум · Кафе · вчера (обед)". */
function operationLine(
  operation: Pick<
    OperationView,
    "kind" | "amount" | "currency" | "category" | "note" | "localDate"
  >,
  now: DateTime,
) {
  const kind = KIND_WORDS[operation.kind] ?? operation.kind;
  const category = operation.category ? ` · ${operation.category.name}` : "";
  const day = operation.localDate ? ` · ${dayLabel(operation.localDate, now)}` : "";
  const note = operation.note ? ` (${operation.note})` : "";

  return `${kind} ${formatMoneyIn(operation.amount, operation.currency)}${category}${day}${note}`;
}

function compactOperation(operation: OperationView, timezone: string) {
  return {
    id: operation.id,
    kind: operation.kind,
    amount: operation.amount,
    currency: operation.currency,
    category: operation.category?.name ?? null,
    categoryId: operation.category?.id ?? null,
    note: operation.note,
    date: operation.localDate,
    time: DateTime.fromISO(operation.occurredAt).setZone(timezone).toFormat("HH:mm"),
    accounts: operation.entries.map((entry) => entry.accountName),
  };
}

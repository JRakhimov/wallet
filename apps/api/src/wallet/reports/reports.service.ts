import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { decimal, operationInclude } from "../operations/operation.view";
import { OperationsService } from "../operations/operations.service";
import { PrismaService } from "../../prisma/prisma.service";
import { computeInsights, InsightRow, insightsRange } from "./insights";
import { transactionsCsv } from "./transactions-csv";

type CategoryTotal = { id: string; name: string; icon: string; value: Prisma.Decimal };

@Injectable()
export class ReportsService {
  constructor(
    private readonly db: PrismaService,
    private readonly operations: OperationsService,
  ) {}

  /** Month totals: net spending by category and day, income and budget remainder. */
  async summary(ownerId: string, requestedMonth?: string) {
    const { where, timezone, month } = await this.operations.buildFilter(ownerId, {
      month: requestedMonth,
    });
    const [operations, budget] = await this.db.$transaction([
      this.db.operation.findMany({ where, include: { category: true } }),
      this.db.budget.findUnique({ where: { ownerId_month: { ownerId, month } } }),
    ]);

    let expenses = decimal(0);
    let refunds = decimal(0);
    let income = decimal(0);
    const byCategory = new Map<string, CategoryTotal>();
    const byDay = new Map<string, Prisma.Decimal>();

    for (const operation of operations) {
      if (operation.kind === "income") {
        income = income.plus(operation.amount);
        continue;
      }
      if (operation.kind !== "expense" && operation.kind !== "refund") {
        continue;
      }

      // Refunds reduce spending in the category and on the day they happen.
      const isRefund = operation.kind === "refund";
      const spent = isRefund ? operation.amount.negated() : operation.amount;
      if (isRefund) {
        refunds = refunds.plus(operation.amount);
      } else {
        expenses = expenses.plus(operation.amount);
      }

      const category = operation.category!;
      const total = byCategory.get(category.id) ?? {
        id: category.id,
        name: category.name,
        icon: category.icon,
        value: decimal(0),
      };
      total.value = total.value.plus(spent);
      byCategory.set(category.id, total);

      const day = DateTime.fromJSDate(operation.occurredAt).setZone(timezone).toISODate()!;
      byDay.set(day, (byDay.get(day) ?? decimal(0)).plus(spent));
    }

    const netExpense = expenses.minus(refunds);
    return {
      month,
      expense: expenses.toFixed(2),
      refunds: refunds.toFixed(2),
      netExpense: netExpense.toFixed(2),
      income: income.toFixed(2),
      budget: budget ? budget.amount.toFixed(2) : null,
      remaining: budget ? budget.amount.minus(netExpense).toFixed(2) : null,
      categories: [...byCategory.values()]
        .sort((a, b) => b.value.comparedTo(a.value))
        .map((total) => ({ ...total, value: total.value.toFixed(2) })),
      days: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value: value.toFixed(2) })),
    };
  }

  /** Spending patterns of a month: recent days, weeks, weekdays, trends and facts. */
  async insights(ownerId: string, requestedMonth?: string) {
    const { timezone, month } = await this.operations.buildFilter(ownerId, {
      month: requestedMonth,
    });
    const now = DateTime.now();
    const [operations, budget] = await this.db.$transaction([
      this.db.operation.findMany({
        where: {
          ownerId,
          deletedAt: null,
          kind: { in: ["expense", "refund"] },
          occurredAt: insightsRange(month, timezone, now),
        },
        include: { category: true },
      }),
      this.db.budget.findUnique({ where: { ownerId_month: { ownerId, month } } }),
    ]);

    const rows: InsightRow[] = operations.map((operation) => ({
      occurredAt: operation.occurredAt,
      kind: operation.kind as InsightRow["kind"],
      amount: operation.amount,
      note: operation.note,
      category: {
        id: operation.category!.id,
        name: operation.category!.name,
        icon: operation.category!.icon,
      },
    }));
    return computeInsights({ rows, month, timezone, now, budget: budget?.amount ?? null });
  }

  async exportCsv(ownerId: string, month?: string) {
    const { where, timezone } = await this.operations.buildFilter(ownerId, { month });
    const operations = await this.db.operation.findMany({
      where,
      include: operationInclude,
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    return transactionsCsv(operations, timezone);
  }
}

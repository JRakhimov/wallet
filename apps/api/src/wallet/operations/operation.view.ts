import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";

/** Relations needed to render an operation for the client. */
export const operationInclude = {
  category: true,
  entries: { include: { account: true } },
  refunds: { where: { deletedAt: null }, select: { amount: true } },
} satisfies Prisma.OperationInclude;

export type DetailedOperation = Prisma.OperationGetPayload<{ include: typeof operationInclude }>;

export const decimal = (value: string | number) => new Prisma.Decimal(value);

export const sum = (values: Prisma.Decimal[]) =>
  values.reduce((total, value) => total.plus(value), decimal(0));

export function operationView(operation: DetailedOperation, timezone: string) {
  return {
    id: operation.id,
    kind: operation.kind,
    amount: operation.amount.toFixed(2),
    currency: operation.currency,
    rate: operation.rate?.toString() ?? null,
    category: operation.category,
    note: operation.note,
    occurredAt: operation.occurredAt.toISOString(),
    localDate: DateTime.fromJSDate(operation.occurredAt).setZone(timezone).toISODate(),
    version: operation.version,
    deleted: Boolean(operation.deletedAt),
    parentId: operation.parentId,
    refunded: sum(operation.refunds.map((refund) => refund.amount)).toFixed(2),
    entries: operation.entries.map((entry) => ({
      accountId: entry.accountId,
      accountName: entry.account.name,
      currency: entry.account.currency,
      amount: entry.amount.toFixed(2),
    })),
  };
}

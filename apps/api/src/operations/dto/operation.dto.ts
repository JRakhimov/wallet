import { z } from "zod";
import { month, positiveMoney, uuid, version } from "../../common/validation/schemas";

const MIN_YEAR = 2000;
const FUTURE_TOLERANCE_MS = 60_000;

const occurredAt = z
  .string()
  .datetime({ offset: true })
  .refine((value) => {
    const date = new Date(value);
    return date.getFullYear() >= MIN_YEAR && date.getTime() <= Date.now() + FUTURE_TOLERANCE_MS;
  }, "Дата должна быть между 2000 годом и текущим временем");

export const operationSchema = z
  .object({
    kind: z.enum(["expense", "income", "transfer", "adjustment", "refund"]),
    amount: positiveMoney,
    accountId: uuid,
    targetAccountId: uuid.optional(),
    categoryId: uuid.optional(),
    parentId: uuid.optional(),
    direction: z.enum(["in", "out"]).optional(),
    note: z.string().trim().max(500).default(""),
    occurredAt,
  })
  .strict();

export const updateOperationSchema = operationSchema.extend({ version });

export const versionSchema = z.object({ version }).strict();

export const operationQuerySchema = z
  .object({
    month: month.optional(),
    kind: z.enum(["expense", "income", "transfer", "refund", "adjustment", "opening"]).optional(),
    categoryId: uuid.optional(),
    accountId: uuid.optional(),
    q: z.string().max(100).optional(),
    cursor: uuid.optional(),
    deleted: z.enum(["true", "false"]).optional(),
  })
  .strict();

export type OperationDto = z.infer<typeof operationSchema>;
export type UpdateOperationDto = z.infer<typeof updateOperationSchema>;
export type VersionDto = z.infer<typeof versionSchema>;
export type OperationQueryDto = z.infer<typeof operationQuerySchema>;
export type OperationFilterDto = Omit<OperationQueryDto, "cursor">;

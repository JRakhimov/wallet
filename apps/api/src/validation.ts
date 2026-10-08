import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { DateTime } from 'luxon';
export function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.issues.map(i => i.path.join('.') + ': ' + i.message).join('; '));
  return result.data as z.output<S>;
}
export const uuid = z.string().uuid();
export const money = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/, 'Введите сумму до 12 целых и 2 дробных знаков');
export const positiveMoney = money.refine(s => /[1-9]/.test(s), 'Сумма должна быть больше нуля');
export const signedMoney = z.string().regex(/^-?(0|[1-9]\d{0,11})(\.\d{1,2})?$/);
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(s => Number(s.slice(0,4)) >= 2000 && Number(s.slice(0,4)) <= 2100);
export function monthRange(month: string, timezone: string) {
  parse(monthSchema, month);
  const start = DateTime.fromISO(month + '-01', { zone: timezone }).startOf('day');
  if (!start.isValid) throw new BadRequestException('Некорректный период');
  return { gte: start.toJSDate(), lt: start.plus({ months: 1 }).toJSDate() };
}
export function currentMonth(timezone: string) { return DateTime.now().setZone(timezone).toFormat('yyyy-MM'); }
export const operationSchema = z.object({
  kind: z.enum(['expense', 'income', 'transfer', 'adjustment', 'refund']),
  amount: positiveMoney,
  accountId: uuid,
  targetAccountId: uuid.optional(),
  categoryId: uuid.optional(),
  parentId: uuid.optional(),
  direction: z.enum(['in', 'out']).optional(),
  note: z.string().trim().max(500).default(''),
  occurredAt: z.string().datetime({ offset: true }).refine(s => {
    const d = new Date(s); return d.getFullYear() >= 2000 && d.getTime() <= Date.now() + 60_000;
  }, 'Дата должна быть между 2000 годом и текущим временем'),
}).strict();
export type OperationInput = z.infer<typeof operationSchema>;

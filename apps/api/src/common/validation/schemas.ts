import { z } from "zod";

const MONEY = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;
const SIGNED_MONEY = /^-?(0|[1-9]\d{0,11})(\.\d{1,2})?$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const uuid = z.string().uuid();

export const label = z.string().trim().min(1).max(50);

export const version = z.number().int().positive();

export const money = z.string().regex(MONEY, "Введите сумму до 12 целых и 2 дробных знаков");

export const positiveMoney = money.refine(
  (value) => /[1-9]/.test(value),
  "Сумма должна быть больше нуля",
);

export const signedMoney = z.string().regex(SIGNED_MONEY);

export const month = z
  .string()
  .regex(MONTH)
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    return year >= 2000 && year <= 2100;
  });

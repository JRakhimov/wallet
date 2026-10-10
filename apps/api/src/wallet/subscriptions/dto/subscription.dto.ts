import { z } from "zod";
import { label, positiveMoney } from "../../../common/validation/schemas";

const MAX_CHARGE_DAY = 31;

export const createSubscriptionSchema = z
  .object({
    name: label,
    amount: positiveMoney,
    chargeDay: z.number().int().min(1).max(MAX_CHARGE_DAY),
  })
  .strict();

export const updateSubscriptionSchema = createSubscriptionSchema.partial();

export type CreateSubscriptionDto = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionDto = z.infer<typeof updateSubscriptionSchema>;

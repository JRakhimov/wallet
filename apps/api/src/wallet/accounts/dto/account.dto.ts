import { z } from "zod";
import { label, signedMoney } from "../../../common/validation/schemas";
import { CURRENCIES } from "../../currency";

export const createAccountSchema = z
  .object({
    name: label,
    kind: z.enum(["card", "cash", "savings"]).default("card"),
    currency: z.enum(CURRENCIES).default("UZS"),
    openingBalance: signedMoney.default("0"),
  })
  .strict();

export const updateAccountSchema = z
  .object({
    name: label.optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export type CreateAccountDto = z.infer<typeof createAccountSchema>;
export type UpdateAccountDto = z.infer<typeof updateAccountSchema>;

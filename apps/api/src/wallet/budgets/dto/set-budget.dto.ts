import { z } from "zod";
import { positiveMoney } from "../../../common/validation/schemas";

export const setBudgetSchema = z.object({ amount: positiveMoney }).strict();

export type SetBudgetDto = z.infer<typeof setBudgetSchema>;

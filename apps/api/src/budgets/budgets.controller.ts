import { Body, Controller, Param, Put } from "@nestjs/common";
import { OwnerId } from "../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { month } from "../common/validation/schemas";
import { BudgetsService } from "./budgets.service";
import { SetBudgetDto, setBudgetSchema } from "./dto/set-budget.dto";

@Controller("budgets")
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Put(":month")
  set(
    @OwnerId() ownerId: string,
    @Param("month", new ZodValidationPipe(month)) budgetMonth: string,
    @Body(new ZodValidationPipe(setBudgetSchema)) body: SetBudgetDto,
  ) {
    return this.budgets.set(ownerId, budgetMonth, body.amount);
  }
}

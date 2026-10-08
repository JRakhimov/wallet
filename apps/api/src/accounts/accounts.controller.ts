import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { OwnerId } from "../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { uuid } from "../common/validation/schemas";
import { AccountsService } from "./accounts.service";
import {
  CreateAccountDto,
  createAccountSchema,
  UpdateAccountDto,
  updateAccountSchema,
} from "./dto/account.dto";

@Controller("accounts")
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@OwnerId() ownerId: string) {
    return this.accounts.list(ownerId);
  }

  @Post()
  create(
    @OwnerId() ownerId: string,
    @Body(new ZodValidationPipe(createAccountSchema)) body: CreateAccountDto,
  ) {
    return this.accounts.create(ownerId, body);
  }

  @Patch(":id")
  update(
    @OwnerId() ownerId: string,
    @Param("id", new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(updateAccountSchema)) body: UpdateAccountDto,
  ) {
    return this.accounts.update(ownerId, id, body);
  }
}

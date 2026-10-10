import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { OwnerId } from "../../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { uuid } from "../../common/validation/schemas";
import {
  CreateSubscriptionDto,
  createSubscriptionSchema,
  UpdateSubscriptionDto,
  updateSubscriptionSchema,
} from "./dto/subscription.dto";
import { SubscriptionsService } from "./subscriptions.service";

@Controller("subscriptions")
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  list(@OwnerId() ownerId: string) {
    return this.subscriptions.list(ownerId);
  }

  @Post()
  create(
    @OwnerId() ownerId: string,
    @Body(new ZodValidationPipe(createSubscriptionSchema)) body: CreateSubscriptionDto,
  ) {
    return this.subscriptions.create(ownerId, body);
  }

  @Patch(":id")
  update(
    @OwnerId() ownerId: string,
    @Param("id", new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(updateSubscriptionSchema)) body: UpdateSubscriptionDto,
  ) {
    return this.subscriptions.update(ownerId, id, body);
  }

  @Delete(":id")
  remove(@OwnerId() ownerId: string, @Param("id", new ZodValidationPipe(uuid)) id: string) {
    return this.subscriptions.remove(ownerId, id);
  }
}

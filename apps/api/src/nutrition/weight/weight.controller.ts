import { Body, Controller, Delete, Get, Param, Put } from "@nestjs/common";
import { OwnerId } from "../../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { uuid } from "../../common/validation/schemas";
import { WeightDto, weightSchema } from "./dto/weight.dto";
import { WeightService } from "./weight.service";

@Controller("nutrition/weight")
export class WeightController {
  constructor(private readonly weight: WeightService) {}

  @Get()
  list(@OwnerId() ownerId: string) {
    return this.weight.list(ownerId);
  }

  /** Saves the weigh-in of a day; repeating it for the same day replaces the weight. */
  @Put()
  record(@OwnerId() ownerId: string, @Body(new ZodValidationPipe(weightSchema)) body: WeightDto) {
    return this.weight.record(ownerId, body);
  }

  @Delete(":id")
  remove(@OwnerId() ownerId: string, @Param("id", new ZodValidationPipe(uuid)) id: string) {
    return this.weight.remove(ownerId, id);
  }
}

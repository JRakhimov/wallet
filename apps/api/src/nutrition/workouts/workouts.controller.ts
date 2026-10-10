import { Body, Controller, Delete, Param, Post, Put } from "@nestjs/common";
import { IdempotencyKey } from "../../common/decorators/idempotency-key.decorator";
import { OwnerId } from "../../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { uuid } from "../../common/validation/schemas";
import { WorkoutDto, workoutSchema } from "./dto/workout.dto";
import { WorkoutsService } from "./workouts.service";

const idPipe = new ZodValidationPipe(uuid);
const bodyPipe = new ZodValidationPipe(workoutSchema);

@Controller("nutrition/workouts")
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  @Post()
  create(
    @OwnerId() ownerId: string,
    @IdempotencyKey() idempotencyKey: string,
    @Body(bodyPipe) body: WorkoutDto,
  ) {
    return this.workouts.create(ownerId, body, idempotencyKey);
  }

  @Put(":id")
  update(
    @OwnerId() ownerId: string,
    @Param("id", idPipe) id: string,
    @Body(bodyPipe) body: WorkoutDto,
  ) {
    return this.workouts.update(ownerId, id, body);
  }

  @Delete(":id")
  remove(@OwnerId() ownerId: string, @Param("id", idPipe) id: string) {
    return this.workouts.remove(ownerId, id);
  }
}

import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { IdempotencyKey } from "../common/decorators/idempotency-key.decorator";
import { OwnerId } from "../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { uuid } from "../common/validation/schemas";
import {
  CreateTaskDto,
  createTaskSchema,
  UpdateTaskDto,
  updateTaskSchema,
  VersionDto,
  versionSchema,
} from "./dto/task.dto";
import { TasksService } from "./tasks.service";

const idPipe = new ZodValidationPipe(uuid);
const versionPipe = new ZodValidationPipe(versionSchema);

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@OwnerId() ownerId: string) {
    return this.tasks.list(ownerId);
  }

  @Post()
  create(
    @OwnerId() ownerId: string,
    @IdempotencyKey() idempotencyKey: string,
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskDto,
  ) {
    return this.tasks.create(ownerId, body, idempotencyKey);
  }

  @Put(":id")
  update(
    @OwnerId() ownerId: string,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskDto,
  ) {
    return this.tasks.update(ownerId, id, body);
  }

  @Post(":id/done")
  complete(
    @OwnerId() ownerId: string,
    @Param("id", idPipe) id: string,
    @Body(versionPipe) body: VersionDto,
  ) {
    return this.tasks.complete(ownerId, id, body.version);
  }

  @Post(":id/reopen")
  reopen(
    @OwnerId() ownerId: string,
    @Param("id", idPipe) id: string,
    @Body(versionPipe) body: VersionDto,
  ) {
    return this.tasks.reopen(ownerId, id, body.version);
  }

  @Delete(":id")
  remove(
    @OwnerId() ownerId: string,
    @Param("id", idPipe) id: string,
    @Body(versionPipe) body: VersionDto,
  ) {
    return this.tasks.remove(ownerId, id, body.version);
  }
}

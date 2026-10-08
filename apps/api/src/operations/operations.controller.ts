import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { IdempotencyKey } from "../common/decorators/idempotency-key.decorator";
import { OwnerId } from "../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { uuid } from "../common/validation/schemas";
import {
  OperationDto,
  OperationQueryDto,
  operationQuerySchema,
  operationSchema,
  UpdateOperationDto,
  updateOperationSchema,
  VersionDto,
  versionSchema,
} from "./dto/operation.dto";
import { OperationsService } from "./operations.service";

const idPipe = new ZodValidationPipe(uuid);

@Controller("transactions")
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get()
  list(
    @OwnerId() ownerId: string,
    @Query(new ZodValidationPipe(operationQuerySchema)) query: OperationQueryDto,
  ) {
    return this.operations.list(ownerId, query);
  }

  @Post()
  create(
    @OwnerId() ownerId: string,
    @Body(new ZodValidationPipe(operationSchema)) body: OperationDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.operations.create(ownerId, body, idempotencyKey);
  }

  @Patch(":id")
  update(
    @OwnerId() ownerId: string,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(updateOperationSchema)) body: UpdateOperationDto,
  ) {
    const { version, ...input } = body;
    return this.operations.update(ownerId, id, input, version);
  }

  @Delete(":id")
  remove(
    @OwnerId() ownerId: string,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(versionSchema)) body: VersionDto,
  ) {
    return this.operations.remove(ownerId, id, body.version);
  }

  @Post(":id/restore")
  restore(
    @OwnerId() ownerId: string,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(versionSchema)) body: VersionDto,
  ) {
    return this.operations.restore(ownerId, id, body.version);
  }
}

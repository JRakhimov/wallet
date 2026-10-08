import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";
import { parse } from "../validation/parse";
import { uuid } from "../validation/schemas";

/** Required `Idempotency-Key` header (UUID) that makes retries safe. */
export const IdempotencyKey = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<Request>();
  return parse(uuid, request.headers["idempotency-key"]);
});

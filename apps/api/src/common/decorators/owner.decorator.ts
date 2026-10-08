import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { OwnerRequest } from "../types/owner-request";

const currentRequest = (context: ExecutionContext) =>
  context.switchToHttp().getRequest<OwnerRequest>();

/** ID of the signed-in owner. Set by AuthGuard. */
export const OwnerId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => currentRequest(context).ownerId,
);

/** Hash of the current session token. Set by AuthGuard. */
export const SessionHash = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => currentRequest(context).sessionHash,
);

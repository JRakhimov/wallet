import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC } from "../common/decorators/public.decorator";
import { OwnerRequest } from "../common/types/owner-request";
import { sha256 } from "../common/utils/hash";
import { AppConfig, CONFIG } from "../config/app-config";
import { PrismaService } from "../prisma/prisma.service";

const BEARER_TOKEN = /^Bearer ([A-Za-z0-9_-]{43})$/;

/** Requires a valid session on every route except those marked with @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<OwnerRequest>();
    const bearer = BEARER_TOKEN.exec(req.headers.authorization || "");
    if (!bearer) {
      throw new UnauthorizedException("Требуется вход");
    }

    const tokenHash = sha256(bearer[1]);
    const session = await this.db.session.findUnique({
      where: { tokenHash },
      include: { owner: true },
    });
    const valid =
      session &&
      session.expiresAt.getTime() > Date.now() &&
      session.owner.telegramId === this.config.ownerTelegramId;
    if (!valid) {
      throw new UnauthorizedException("Сессия истекла. Выполните вход снова");
    }

    req.ownerId = session.ownerId;
    req.sessionHash = tokenHash;
    return true;
  }
}

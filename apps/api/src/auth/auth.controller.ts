import { Body, Controller, ForbiddenException, Get, Inject, Post } from "@nestjs/common";
import { AccessService } from "../access/access.service";
import { Public } from "../common/decorators/public.decorator";
import { SessionHash } from "../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AppConfig, CONFIG } from "../config/app-config";
import { AuthService } from "./auth.service";
import { TelegramLoginDto, telegramLoginSchema } from "./dto/telegram-login.dto";
import { verifyTelegram } from "./telegram-init-data";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly access: AccessService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get("config")
  getConfig() {
    return { dev: this.config.dev };
  }

  @Public()
  @Post("dev")
  loginDev() {
    if (!this.config.dev) {
      throw new ForbiddenException("Локальный вход отключён");
    }
    return this.auth.login(this.config.ownerTelegramId);
  }

  @Public()
  @Post("telegram")
  async loginTelegram(@Body(new ZodValidationPipe(telegramLoginSchema)) body: TelegramLoginDto) {
    if (this.config.dev) {
      throw new ForbiddenException("Используйте локальный вход");
    }
    const user = verifyTelegram(body.initData, this.config.botToken);
    const telegramId = BigInt(user.id);
    if (!(await this.access.isAllowed(telegramId))) {
      throw new ForbiddenException("Нет доступа. Попросите владельца открыть вам доступ");
    }
    return this.auth.login(telegramId);
  }

  @Post("logout")
  logout(@SessionHash() sessionHash: string) {
    return this.auth.logout(sessionHash);
  }
}

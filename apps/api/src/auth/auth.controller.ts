import { Body, Controller, ForbiddenException, Get, Inject, Post } from "@nestjs/common";
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
    return this.auth.login();
  }

  @Public()
  @Post("telegram")
  loginTelegram(@Body(new ZodValidationPipe(telegramLoginSchema)) body: TelegramLoginDto) {
    if (this.config.dev) {
      throw new ForbiddenException("Используйте локальный вход");
    }
    verifyTelegram(body.initData, this.config.botToken, this.config.ownerTelegramId);
    return this.auth.login();
  }

  @Post("logout")
  logout(@SessionHash() sessionHash: string) {
    return this.auth.logout(sessionHash);
  }
}

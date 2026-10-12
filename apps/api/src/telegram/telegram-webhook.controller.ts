import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { Public } from "../common/decorators/public.decorator";
import { AppConfig, CONFIG } from "../config/app-config";
import { TelegramBotService, Update } from "./telegram-bot.service";

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

function sameSecret(received: string | undefined, expected: string) {
  const a = Buffer.from(received ?? "");
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Updates pushed by Telegram in webhook mode. Telegram signs each request with the secret
 * set in setWebhook; anything else is refused. The update is handled after the answer.
 */
@Public()
@Controller("telegram")
export class TelegramWebhookController {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly bot: TelegramBotService,
  ) {}

  @Post("webhook")
  @HttpCode(200)
  receive(@Headers(SECRET_HEADER) secret: string | undefined, @Body() update: Update) {
    if (!this.config.webhook) {
      throw new NotFoundException();
    }

    if (!sameSecret(secret, this.config.webhook.secret)) {
      throw new UnauthorizedException();
    }

    if (Number.isInteger(update?.update_id)) {
      void this.bot.enqueue(update);
    }

    return { ok: true };
  }
}

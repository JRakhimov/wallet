import { UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const MAX_AGE_SECONDS = 300;
const CLOCK_SKEW_SECONDS = 30;

const telegramUserSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  first_name: z.string().optional(),
});

/**
 * Validates Mini App `initData` and returns the Telegram user it was signed for. Whether that
 * user may enter is decided by AccessService.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegram(initData: string, botToken: string, now = Date.now()) {
  const params = new URLSearchParams(initData);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) {
    throw new UnauthorizedException("Повторяющиеся поля авторизации");
  }

  const hash = params.get("hash") || "";
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new UnauthorizedException("Неверная подпись Telegram");
  }
  params.delete("hash");
  if (!timingSafeEqual(sign(params, botToken), Buffer.from(hash, "hex"))) {
    throw new UnauthorizedException("Неверная подпись Telegram");
  }

  const authDate = Number(params.get("auth_date"));
  const nowSeconds = now / 1000;
  const expired = nowSeconds - authDate > MAX_AGE_SECONDS;
  const fromFuture = authDate > nowSeconds + CLOCK_SKEW_SECONDS;
  if (!Number.isInteger(authDate) || expired || fromFuture) {
    throw new UnauthorizedException("Переоткройте приложение в Telegram");
  }

  const user = telegramUserSchema.safeParse(parseJson(params.get("user")));
  if (!user.success) {
    throw new UnauthorizedException("Нет пользователя Telegram");
  }
  return user.data;
}

function sign(params: URLSearchParams, botToken: string) {
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  return createHmac("sha256", secret).update(dataCheckString).digest();
}

function parseJson(value: string | null): unknown {
  try {
    return JSON.parse(value || "null");
  } catch {
    return null;
  }
}

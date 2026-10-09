import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { setTimeout as delay } from "node:timers/promises";
import { AppConfig, CONFIG } from "../config/app-config";
import { PrismaService } from "../prisma/prisma.service";

type Message = {
  text?: string;
  from?: { id: number };
  chat: { id: number; type: string };
};

type Update = {
  update_id: number;
  message?: Message;
};

const POLL_TIMEOUT_SECONDS = 30;
const RETRY_DELAY_MS = 5000;
const START_COMMAND = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/;
const WELCOME_TEXT = "Ваши личные приложения. Выберите, что открыть.";

/** Long-polls Telegram and answers the owner's /start with a Mini App button. */
@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly stop = new AbortController();
  private task?: Promise<void>;

  constructor(
    private readonly db: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.dev) {
      return;
    }
    await this.call("deleteWebhook", { drop_pending_updates: false });
    this.task = this.poll();
    this.logger.log("Telegram bot started in polling mode");
  }

  async onModuleDestroy() {
    this.stop.abort();
    await this.task;
  }

  /** Handles one update. Each update is answered at most once, even after restarts. */
  async handleUpdate(update: Update) {
    const message = update.message;
    if (!message || !this.isOwnerStartCommand(message)) {
      return;
    }

    const updateId = BigInt(update.update_id);
    const firstTime = await this.markProcessed(updateId);
    if (!firstTime) {
      return;
    }

    try {
      await this.call("sendMessage", {
        chat_id: message.chat.id,
        text: WELCOME_TEXT,
        reply_markup: { inline_keyboard: this.appButtons() },
      });
    } catch (error) {
      // Let the next poll retry this update.
      await this.db.botUpdate.delete({ where: { updateId } });
      throw error;
    }
  }

  /** One button per deployed mini app, each on its own row. */
  private appButtons() {
    const apps = [
      { text: "💳 Кошелёк", url: this.config.miniAppUrl },
      { text: "🥗 Питание", url: this.config.nutritionAppUrl },
    ];
    return apps.filter((app) => app.url).map(({ text, url }) => [{ text, web_app: { url } }]);
  }

  private async poll() {
    let offset = 0;
    while (!this.stop.signal.aborted) {
      try {
        const updates = await this.call<Update[]>("getUpdates", {
          offset,
          timeout: POLL_TIMEOUT_SECONDS,
          allowed_updates: ["message"],
        });
        for (const update of updates) {
          if (this.stop.signal.aborted) {
            return;
          }
          await this.handleUpdate(update);
          offset = update.update_id + 1;
        }
      } catch {
        if (this.stop.signal.aborted) {
          return;
        }
        this.logger.warn("Telegram polling failed; retrying in 5 seconds");
        await delay(RETRY_DELAY_MS, undefined, { signal: this.stop.signal }).catch(() => {});
      }
    }
  }

  private isOwnerStartCommand(message: Message) {
    return (
      message.from !== undefined &&
      BigInt(message.from.id) === this.config.ownerTelegramId &&
      message.chat.type === "private" &&
      message.chat.id === message.from.id &&
      START_COMMAND.test(message.text || "")
    );
  }

  /** Returns false when the update was already processed. */
  private async markProcessed(updateId: bigint) {
    try {
      await this.db.botUpdate.create({ data: { updateId } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return false;
      }
      throw error;
    }
  }

  private async call<T>(method: string, body: object): Promise<T> {
    // getUpdates waits up to POLL_TIMEOUT_SECONDS, so it needs a longer timeout.
    const timeoutMs = method === "getUpdates" ? 40_000 : 10_000;
    const response = await fetch(`https://api.telegram.org/bot${this.config.botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([this.stop.signal, AbortSignal.timeout(timeoutMs)]),
    });
    const result = (await response.json()) as { ok: boolean; result: T };
    // Do not log fetch errors or URLs: they can contain the bot token.
    if (!response.ok || !result.ok) {
      throw new Error("Telegram request failed");
    }
    return result.result;
  }
}

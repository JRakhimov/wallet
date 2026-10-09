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
import { VoiceError, VoiceTransactionService } from "../voice/voice-transaction.service";

/** A voice message or an audio file; both carry speech. */
type SpeechFile = { file_id: string; file_size?: number; duration?: number; file_name?: string };

type Message = {
  text?: string;
  voice?: SpeechFile;
  audio?: SpeechFile;
  from?: { id: number };
  chat: { id: number; type: string };
};

export type MiniApp = "wallet" | "nutrition";

type Update = {
  update_id: number;
  message?: Message;
};

const POLL_TIMEOUT_SECONDS = 30;
const RETRY_DELAY_MS = 5000;
const START_COMMAND = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/;
const WELCOME_TEXT = "Ваши личные приложения. Выберите, что открыть.";
const VOICE_ACCEPTED_TEXT = "Принято в обработку…";
const VOICE_RECOGNIZING_TEXT = "Распознаём голос…";
const VOICE_PARSING_TEXT = "Определяем сумму и категорию…";
const VOICE_FAILED_STATUS = "Не удалось распознать";
const VOICE_FAILED_TEXT = "Не удалось обработать сообщение. Попробуйте ещё раз";
const VOICE_TOO_LONG_TEXT = "Сообщение слишком длинное. Запишите короче, до двух минут";
// A spoken note about one expense is a few seconds; this keeps a mistaken long recording cheap.
const MAX_VOICE_SECONDS = 120;
const MAX_VOICE_BYTES = 5 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Long-polls Telegram. The owner's /start gets Mini App buttons; a voice message is turned
 * into a wallet operation (see VoiceTransactionService).
 */
@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly stop = new AbortController();
  private task?: Promise<void>;

  constructor(
    private readonly db: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly voice: VoiceTransactionService,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.dev && !this.config.botInDev) {
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
    if (!message || !this.isOwnerPrivateChat(message)) {
      return;
    }
    const isStart = START_COMMAND.test(message.text || "");
    const speech = message.voice ?? message.audio;
    if (!isStart && !speech) {
      return;
    }

    const updateId = BigInt(update.update_id);
    const firstTime = await this.markProcessed(updateId);
    if (!firstTime) {
      return;
    }

    if (speech) {
      // Not retried after a failure: the operation may already be written.
      await this.handleSpeech(message, speech, update.update_id);
      return;
    }

    try {
      await this.call("sendMessage", {
        chat_id: message.chat.id,
        text: WELCOME_TEXT,
        disable_notification: true,
        reply_markup: { inline_keyboard: this.appButtons() },
      });
    } catch (error) {
      // Let the next poll retry this update.
      await this.db.botUpdate.delete({ where: { updateId } });
      throw error;
    }
  }

  /**
   * Reports a voice message in one chat message that changes with the progress and ends with
   * the result. A failure edits it to "Не удалось распознать" and sends a separate message
   * with sound, so the owner knows that nothing was recorded. Everything else is silent.
   */
  private async handleSpeech(message: Message, speech: SpeechFile, updateId: number) {
    const chatId = message.chat.id;
    let statusId: number | undefined;

    const show = async (text: string) => {
      try {
        if (statusId) {
          await this.call("editMessageText", { chat_id: chatId, message_id: statusId, text });
          return;
        }
      } catch {
        // Edit failed (e.g. the message was deleted): send a new one instead.
      }
      statusId = await this.send(chatId, text, true);
    };
    const fail = async (reason: string) => {
      if (statusId) {
        await show(VOICE_FAILED_STATUS);
      }
      await this.send(chatId, `${reason}\nОперация не записана.`, false);
    };

    if (!this.voice.enabled) {
      await fail("Голосовые команды не настроены на сервере.");
      return;
    }
    if ((speech.duration ?? 0) > MAX_VOICE_SECONDS || (speech.file_size ?? 0) > MAX_VOICE_BYTES) {
      await fail(VOICE_TOO_LONG_TEXT);
      return;
    }

    await show(VOICE_ACCEPTED_TEXT);
    try {
      await show(VOICE_RECOGNIZING_TEXT);
      const audio = await this.download(speech.file_id);
      const text = await this.voice.record({
        telegramId: BigInt(message.from!.id),
        audio: audio.data,
        filename: audio.filename,
        key: `telegram-voice-${updateId}`,
        onStage: () => show(VOICE_PARSING_TEXT),
      });
      await show(text);
    } catch (error) {
      if (error instanceof VoiceError) {
        await fail(error.message);
        return;
      }
      // The error may carry request URLs with the bot token: log only its type.
      this.logger.error(`Voice message failed: ${error instanceof Error ? error.name : "unknown"}`);
      await fail(VOICE_FAILED_TEXT);
    }
  }

  /** Sends a message; returns its id, or undefined if Telegram refused. */
  private async send(chatId: number, text: string, silent: boolean) {
    try {
      const sent = await this.call<{ message_id?: number }>("sendMessage", {
        chat_id: chatId,
        text,
        disable_notification: silent,
      });
      return sent.message_id;
    } catch {
      this.logger.warn("Could not send a voice reply");
      return undefined;
    }
  }

  private async download(fileId: string) {
    try {
      const file = await this.call<{ file_path?: string }>("getFile", { file_id: fileId });
      if (!file.file_path) {
        throw new Error("No file path");
      }
      const response = await fetch(
        `https://api.telegram.org/file/bot${this.config.botToken}/${file.file_path}`,
        { signal: AbortSignal.any([this.stop.signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)]) },
      );
      if (!response.ok) {
        throw new Error("Download failed");
      }
      const extension = file.file_path.split(".").pop() || "ogg";
      return {
        data: Buffer.from(await response.arrayBuffer()),
        // Telegram voice notes are Opus in an Ogg container (.oga); providers expect .ogg.
        filename: `voice.${extension === "oga" ? "ogg" : extension}`,
      };
    } catch {
      throw new VoiceError("Не удалось скачать голосовое сообщение. Попробуйте ещё раз");
    }
  }

  /** Sends a message to the owner's private chat (its id is the owner's Telegram id). */
  async sendToOwner(text: string, options: { silent: boolean; apps?: MiniApp[] }) {
    await this.call("sendMessage", {
      chat_id: Number(this.config.ownerTelegramId),
      text,
      disable_notification: options.silent,
      ...(options.apps && { reply_markup: { inline_keyboard: this.appButtons(options.apps) } }),
    });
  }

  /** One button per deployed mini app (all of them by default), each on its own row. */
  private appButtons(only: MiniApp[] = ["wallet", "nutrition"]) {
    const apps: { id: MiniApp; text: string; url: string }[] = [
      { id: "wallet", text: "💳 Кошелёк", url: this.config.miniAppUrl },
      { id: "nutrition", text: "🥗 Питание", url: this.config.nutritionAppUrl },
    ];
    return apps
      .filter((app) => app.url && only.includes(app.id))
      .map(({ text, url }) => [{ text, web_app: { url } }]);
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

  private isOwnerPrivateChat(message: Message) {
    return (
      message.from !== undefined &&
      BigInt(message.from.id) === this.config.ownerTelegramId &&
      message.chat.type === "private" &&
      message.chat.id === message.from.id
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

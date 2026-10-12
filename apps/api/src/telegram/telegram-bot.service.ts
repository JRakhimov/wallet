import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { setTimeout as delay } from "node:timers/promises";
import { AccessService } from "../access/access.service";
import {
  AssistantError,
  AssistantReply,
  AssistantService,
  ChatInput,
} from "../assistant/assistant.service";
import { AppConfig, CONFIG } from "../config/app-config";
import { PrismaService } from "../prisma/prisma.service";
import { ALL_DAY_REMIND_HOUR } from "../tasks/recurrence";
import { TasksService } from "../tasks/tasks.service";
import { DraftMessage } from "./draft-message";

/** A voice message or an audio file; both carry speech. */
type SpeechFile = { file_id: string; file_size?: number; duration?: number; file_name?: string };

/** One of the sizes Telegram keeps of a photo, smallest first. */
type PhotoSize = { file_id: string; width: number; height: number; file_size?: number };

type Message = {
  text?: string;
  caption?: string;
  voice?: SpeechFile;
  audio?: SpeechFile;
  photo?: PhotoSize[];
  from?: { id: number };
  chat: { id: number; type: string };
};

type CallbackButton = { text: string; callback_data: string };
type WebAppButton = { text: string; web_app: { url: string } };
type InlineButton = CallbackButton | WebAppButton;

/** A tap on an inline button under one of the bot's messages. */
type CallbackQuery = {
  id: string;
  from: { id: number };
  data?: string;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    reply_markup?: { inline_keyboard: InlineButton[][] };
  };
};

export type MiniApp = "wallet" | "nutrition" | "tasks";

export type Update = {
  update_id: number;
  message?: Message;
  callback_query?: CallbackQuery;
  stopped_message_generation?: GenerationStopped;
};

type TaskAction = "done" | "hour" | "tomorrow";

/** The user tapped the stop button of a draft. */
type GenerationStopped = { chat: { id: number }; draft_id: number };

/** Buttons under a task reminder; the bot handles them in handleCallback. */
export function taskButtons(taskId: string): InlineButton[][] {
  return [
    [
      { text: "✅ Готово", callback_data: `task:done:${taskId}` },
      { text: "⏰ Через час", callback_data: `task:hour:${taskId}` },
      { text: "Завтра", callback_data: `task:tomorrow:${taskId}` },
    ],
  ];
}

const ALLOWED_UPDATES = ["message", "callback_query", "stopped_message_generation"];
const POLL_TIMEOUT_SECONDS = 30;
const RETRY_DELAY_MS = 5000;
const START_COMMAND = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/;
const HELP_COMMAND = /^\/help(?:@[A-Za-z0-9_]+)?(?:\s|$)/;
const NEW_COMMAND = /^\/new(?:@[A-Za-z0-9_]+)?(?:\s|$)/;
const ACCESS_COMMAND = /^\/(access|revoke)(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?\s*$/;
const TELEGRAM_ID = /^[1-9]\d{0,15}$/;
const TASK_CALLBACK = /^task:(done|hour|tomorrow):([0-9a-f-]{36})$/;
/** «Подтвердить» or «Отменить» is `act:<id>`, «Отмена» of a confirmation is `act-no:<id>`. */
const ACTION_CALLBACK = /^act(-no)?:([0-9a-f-]{36})$/;
const WELCOME_TEXT =
  "Ваши личные приложения. Выберите, что открыть, или просто напишите, что нужно: я отвечу и запишу сам.";
const HELP_WALLET_LINE = "💳 Кошелёк: счета, расходы и доходы, бюджеты, статистика по месяцам.";
const HELP_NUTRITION_LINE =
  "🥗 Питание: дневник еды по тексту или фото, калории и БЖУ, тренировки, вес, история.";
const HELP_TASKS_LINE = "📝 Задачи: список дел, заметки и напоминания, в том числе повторяющиеся.";
const HELP_ASSISTANT_TEXT = [
  "💬 Ассистент: просто напишите, скажите голосом или пришлите фото. Бот сам найдёт данные во всех приложениях и запишет что нужно.",
  "Спросить:",
  "• «Сколько я потратил в этом месяце и сколько осталось от бюджета?»",
  "• «Что у меня сегодня?»",
  "• «Сколько калорий осталось на сегодня?»",
  "Записать:",
  "• «Обед 45 000», «Вчера такси 30 тысяч»: расход",
  "• «Съел плов, примерно 300 г» или фото тарелки: приём пищи",
  "• Фото чека: расход",
  "• «Вес 82,4», «Тренировка, сожжено 420 калорий»",
  "• «Напомни завтра в 10 позвонить в банк»",
  "• «Запомни: такси — это категория Транспорт»",
  "Под каждой записью есть кнопка «↩️ Отменить». Изменить или удалить («удали последний расход», «перенеси звонок на пятницу») бот предложит кнопкой «Подтвердить».",
  "/new: начать разговор заново.",
].join("\n");
const HELP_REMINDERS_TEXT = [
  "🔔 Если забудете внести еду или расходы, бот напомнит днём и вечером.",
  "О задачах бот напомнит в назначенное время: отметьте «Готово» или отложите кнопкой.",
  "☀️ Утром бот присылает сводку на день с погодой, в 21:00 — итоги дня и что ждёт завтра, в воскресенье вечером — итоги недели. Это меняется словами: «присылай утреннюю сводку в 7:30», «вечернюю сводку не нужно», «не присылай недельный отчёт».",
].join("\n");
const HELP_ADMIN_TEXT = [
  "🔑 Администратору:",
  "/access 123456789: открыть доступ человеку",
  "/access: кто сейчас в списке",
  "/revoke 123456789: закрыть доступ",
].join("\n");
const ACCESS_USAGE_TEXT = "Укажите Telegram id числом, например: /access 123456789";
const REVOKE_USAGE_TEXT = "Укажите Telegram id числом, например: /revoke 123456789";
const ACCESS_NONE_TEXT = "Доступ пока никому не выдан. Чтобы открыть: /access 123456789";
const ACCESS_GRANTED_TEXT = "Вам открыт доступ. Нажмите /start, чтобы начать.";
const NEW_CHAT_TEXT = "Начнём заново. Что нужно сделать или узнать?";
const ACCEPTED_TEXT = "Принято в обработку…";
const PHOTO_TEXT = "Смотрю фото…";
/** An empty draft shows Telegram's own "Thinking…" placeholder. */
const THINKING = "";
const FAILED_TEXT = "Не удалось обработать сообщение. Попробуйте ещё раз";
const NOT_CONFIGURED_TEXT = "Ассистент не настроен на сервере.";
const NOTHING_RECORDED = "Ничего не записано.";
const VOICE_TOO_LONG_TEXT = "Сообщение слишком длинное. Запишите короче, до двух минут";
const DOWNLOAD_FAILED_TEXT = "Не удалось скачать файл. Попробуйте ещё раз";
const TASK_GONE_TEXT = "Задача уже удалена";
const TAP_FAILED_TEXT = "Не получилось. Попробуйте ещё раз";
const SNOOZE_HOURS = 1;
// A spoken request is a few seconds; this keeps a mistaken long recording cheap.
const MAX_VOICE_SECONDS = 120;
const MAX_VOICE_BYTES = 5 * 1024 * 1024;
/** Enough detail to recognize food or read a receipt; Telegram's bigger sizes only cost more. */
const MAX_PHOTO_SIDE = 1600;
/** The diary shows meal photos small. */
const THUMBNAIL_SIDE = 320;
const MAX_MESSAGE_LENGTH = 4096;
const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Talks to Telegram (webhook on production, long polling locally). People with access get
 * Mini App buttons on /start; any other message (text, voice or photo) goes to the assistant,
 * and the buttons under its answers and under task reminders are handled here. The
 * administrator also manages access with /access and /revoke. Everyone else gets no reply.
 */
@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly stop = new AbortController();
  private task?: Promise<void>;
  /** Tail of the webhook queue: updates are handled one at a time, in arrival order. */
  private queue: Promise<void> = Promise.resolve();
  /** Answers being prepared, by chat, so the draft's stop button can abort them. */
  private readonly generations = new Map<number, AbortController>();
  /** Drafts only need ids unique among the ones shown at the same time. */
  private lastDraftId = 0;

  constructor(
    private readonly db: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly assistant: AssistantService,
    private readonly access: AccessService,
    private readonly tasks: TasksService,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.dev && !this.config.botInDev) {
      return;
    }

    if (this.config.webhook) {
      await this.call("setWebhook", {
        url: this.config.webhook.url,
        secret_token: this.config.webhook.secret,
        allowed_updates: ALLOWED_UPDATES,
        drop_pending_updates: false,
      });

      this.logger.log("Telegram bot started in webhook mode");
      return;
    }

    // A webhook means this token belongs to the deployed bot: polling would take it over.
    const webhook = await this.call<{ url?: string }>("getWebhookInfo", {});
    if (webhook.url) {
      this.logger.warn(
        "The bot has a webhook, so it is not polled here. Use a separate test bot locally",
      );
      return;
    }

    this.task = this.poll();
    this.logger.log("Telegram bot started in polling mode");
  }

  async onModuleDestroy() {
    this.stop.abort();

    await this.task;
    await this.queue;
  }

  /**
   * Accepts an update from the webhook without waiting for it: an answer takes up to a
   * minute, and Telegram resends updates it gets no answer to. Repeats are skipped anyway.
   */
  enqueue(update: Update) {
    // A stop must reach the answer that is being prepared now, not wait behind it.
    if (update.stopped_message_generation) {
      this.stopGeneration(update.stopped_message_generation);
      return this.queue;
    }

    this.queue = this.queue.then(() =>
      this.handleUpdate(update).catch((error: unknown) => {
        // The error may carry request URLs with the bot token: log only its type.
        const kind = error instanceof Error ? error.name : "unknown";
        this.logger.error(`Telegram update failed: ${kind}`);
      }),
    );

    return this.queue;
  }

  /** Handles one update. Each update is answered at most once, even after restarts. */
  async handleUpdate(update: Update) {
    if (update.stopped_message_generation) {
      this.stopGeneration(update.stopped_message_generation);
      return;
    }

    if (update.callback_query) {
      await this.handleCallback(update.update_id, update.callback_query);
      return;
    }

    const message = update.message;
    if (!message || !this.isPrivateChat(message)) {
      return;
    }

    const text = message.text || "";
    const isStart = START_COMMAND.test(text);
    const isHelp = HELP_COMMAND.test(text);
    const isNew = NEW_COMMAND.test(text);
    const accessCommand = ACCESS_COMMAND.exec(text);
    const isCommand = isStart || isHelp || isNew || Boolean(accessCommand);
    // Anything else that is not an unknown /command is a message to the assistant.
    const isChat =
      !isCommand && (Boolean(message.voice ?? message.audio ?? message.photo) || isPlainText(text));
    if (!isCommand && !isChat) {
      return;
    }

    const sender = BigInt(message.from!.id);
    const isAdmin = this.access.isAdmin(sender);
    // Strangers, and anyone but the administrator sending /access, get no answer at all.
    if ((accessCommand && !isAdmin) || !(await this.access.isAllowed(sender))) {
      return;
    }

    const updateId = BigInt(update.update_id);
    const firstTime = await this.markProcessed(updateId);
    if (!firstTime) {
      return;
    }

    if (accessCommand) {
      await this.handleAccessCommand(message.chat.id, accessCommand[1], accessCommand[2]);
      return;
    }

    if (isChat) {
      // Not retried after a failure: something may already be recorded.
      await this.handleChat(message, update.update_id);
      return;
    }

    if (isNew) {
      await this.assistant.restartChat(sender);
      await this.send(message.chat.id, NEW_CHAT_TEXT, true);
      return;
    }

    try {
      await this.call("sendMessage", {
        chat_id: message.chat.id,
        text: isHelp ? this.helpText(isAdmin) : WELCOME_TEXT,
        disable_notification: true,
        reply_markup: { inline_keyboard: this.appButtons() },
      });
    } catch (error) {
      // Let the next poll retry this update.
      await this.db.botUpdate.delete({ where: { updateId } });
      throw error;
    }
  }

  /** What the bot can do; only the apps that are deployed are listed. */
  private helpText(isAdmin: boolean) {
    const apps = [
      this.config.miniAppUrl && HELP_WALLET_LINE,
      this.config.nutritionAppUrl && HELP_NUTRITION_LINE,
      this.config.tasksAppUrl && HELP_TASKS_LINE,
    ].filter(Boolean);

    const sections = [
      "Что умеет бот.\n" + apps.join("\n"),
      HELP_ASSISTANT_TEXT,
      HELP_REMINDERS_TEXT,
    ];

    if (isAdmin) {
      sections.push(HELP_ADMIN_TEXT);
    }

    return sections.join("\n\n");
  }

  /** /access lists, grants and /revoke takes away a user's access. Only the administrator gets here. */
  private async handleAccessCommand(chatId: number, command: string, argument?: string) {
    if (!argument) {
      await this.send(
        chatId,
        command === "access" ? await this.accessList() : REVOKE_USAGE_TEXT,
        true,
      );

      return;
    }

    if (!TELEGRAM_ID.test(argument)) {
      await this.send(chatId, command === "access" ? ACCESS_USAGE_TEXT : REVOKE_USAGE_TEXT, true);
      return;
    }

    const telegramId = BigInt(argument);
    if (command === "access") {
      const granted = await this.access.grant(telegramId);

      await this.send(
        chatId,
        granted ? `Доступ выдан: ${argument}` : `У ${argument} уже есть доступ`,
        true,
      );

      if (granted) {
        // Works only if they have already opened the bot; otherwise Telegram refuses.
        await this.send(Number(telegramId), ACCESS_GRANTED_TEXT, false);
      }
      return;
    }

    if (this.access.isAdmin(telegramId)) {
      await this.send(chatId, "Свой доступ отозвать нельзя", true);
      return;
    }

    const revoked = await this.access.revoke(telegramId);
    await this.send(
      chatId,
      revoked ? `Доступ отозван: ${argument}` : `У ${argument} нет доступа`,
      true,
    );
  }

  private async accessList() {
    const granted = (await this.access.allowedIds()).slice(1);
    return granted.length ? `Доступ есть у:\n${granted.join("\n")}` : ACCESS_NONE_TEXT;
  }

  /**
   * Answers a message. While the answer is prepared and written, the chat shows it as a draft
   * (with the progress and a stop button); the finished answer comes as a normal message. A
   * failure is sent with sound, so the person notices even if they have left the chat.
   */
  private async handleChat(message: Message, updateId: number) {
    const chatId = message.chat.id;
    const speech = message.voice ?? message.audio;

    if (!this.assistant.enabled) {
      await this.send(chatId, `${NOT_CONFIGURED_TEXT}\n${NOTHING_RECORDED}`, false);
      return;
    }

    if (speech && isTooLong(speech)) {
      await this.send(chatId, `${VOICE_TOO_LONG_TEXT}\n${NOTHING_RECORDED}`, false);
      return;
    }

    const draft = this.draftFor(chatId);
    const stop = new AbortController();

    this.generations.set(chatId, stop);
    draft.status(firstProgress(message));

    try {
      const input = await this.chatInput(message, updateId);
      const reply = await this.assistant.reply({
        ...input,
        signal: stop.signal,
        onProgress: (text) => draft.status(text),
        onText: (text) => draft.write(text),
      });

      await draft.close();
      await this.sendReply(chatId, reply);
    } catch (error) {
      await draft.close();

      if (error instanceof AssistantError) {
        await this.send(chatId, `${error.message}\n${NOTHING_RECORDED}`, false);
        return;
      }

      // The error may carry request URLs with the bot token: log only its type.
      this.logger.error(`Chat message failed: ${error instanceof Error ? error.name : "unknown"}`);
      await this.send(chatId, FAILED_TEXT, false);
    } finally {
      this.generations.delete(chatId);
    }
  }

  /**
   * The draft of an answer. The stop button needs the webhook: by polling, the tap would only
   * arrive after the answer it should stop.
   */
  private draftFor(chatId: number) {
    const canStop = Boolean(this.config.webhook);

    const sendDraft = async (draftId: number, text: string) => {
      await this.call("sendMessageDraft", {
        chat_id: chatId,
        draft_id: draftId,
        text,
        ...(canStop && { can_stop: true }),
      });
    };

    return new DraftMessage(sendDraft, () => ++this.lastDraftId);
  }

  /** A tap on the draft's stop button. */
  private stopGeneration(stopped: GenerationStopped) {
    this.generations.get(stopped.chat.id)?.abort();
  }

  /** The message for the assistant, with the voice or the photo downloaded. */
  private async chatInput(message: Message, updateId: number): Promise<ChatInput> {
    const speech = message.voice ?? message.audio;

    return {
      telegramId: BigInt(message.from!.id),
      text: message.text ?? message.caption ?? "",
      audio: speech ? await this.downloadSpeech(speech) : null,
      photo: message.photo?.length ? await this.downloadPhoto(message.photo) : null,
      key: `telegram-${updateId}`,
    };
  }

  private async downloadSpeech(speech: SpeechFile) {
    const file = await this.download(speech.file_id);
    const extension = file.path.split(".").pop() || "ogg";

    return {
      data: file.data,
      // Telegram voice notes are Opus in an Ogg container (.oga); providers expect .ogg.
      filename: `voice.${extension === "oga" ? "ogg" : extension}`,
    };
  }

  private async downloadPhoto(sizes: PhotoSize[]) {
    const bySide = [...sizes].sort((a, b) => longSide(a) - longSide(b));
    const full = bySide.filter((size) => longSide(size) <= MAX_PHOTO_SIDE).at(-1) ?? bySide[0];
    const thumbnail = bySide.find((size) => longSide(size) >= THUMBNAIL_SIDE) ?? full;

    const fullFile = await this.download(full.file_id);
    const thumbnailFile =
      thumbnail.file_id === full.file_id ? fullFile : await this.download(thumbnail.file_id);

    return { full: fullFile.data, thumbnail: thumbnailFile.data };
  }

  /**
   * What an MCP client did, with its buttons. A change waiting for confirmation comes with
   * sound: nothing happens until it is tapped.
   */
  async notify(telegramId: bigint, reply: AssistantReply) {
    const waits = reply.buttons.some((row) =>
      row.some((button) => button.data.startsWith("act-no:")),
    );

    await this.sendReply(Number(telegramId), reply, !waits);
  }

  /** The answer; a long one is split into several messages, the buttons go under the last. */
  private async sendReply(chatId: number, reply: AssistantReply, silent = true) {
    const parts = splitText(reply.text, MAX_MESSAGE_LENGTH);
    const keyboard = reply.buttons.map((row) =>
      row.map((button) => ({ text: button.text, callback_data: button.data })),
    );

    for (const [index, part] of parts.entries()) {
      const buttons = index === parts.length - 1 ? keyboard : [];

      await this.send(chatId, part, silent, buttons);
    }
  }

  /** Sends a message; returns its id, or undefined if Telegram refused. */
  private async send(
    chatId: number,
    text: string,
    silent: boolean,
    buttons: InlineButton[][] = [],
  ) {
    try {
      const sent = await this.call<{ message_id?: number }>("sendMessage", {
        chat_id: chatId,
        text,
        disable_notification: silent,
        // Sources under an answer would otherwise expand into a big card.
        link_preview_options: { is_disabled: true },
        ...(buttons.length > 0 && { reply_markup: { inline_keyboard: buttons } }),
      });
      return sent.message_id;
    } catch {
      this.logger.warn("Could not send a reply");
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

      return { data: Buffer.from(await response.arrayBuffer()), path: file.file_path };
    } catch {
      throw new AssistantError(DOWNLOAD_FAILED_TEXT);
    }
  }

  /**
   * Sends a message to a user's private chat (its id is the user's Telegram id). `buttons`
   * go first, then a button for each of `apps`.
   */
  async sendTo(
    telegramId: bigint,
    text: string,
    options: { silent: boolean; apps?: MiniApp[]; buttons?: InlineButton[][] },
  ) {
    const keyboard = [
      ...(options.buttons ?? []),
      ...(options.apps ? this.appButtons(options.apps) : []),
    ];

    await this.call("sendMessage", {
      chat_id: Number(telegramId),
      text,
      disable_notification: options.silent,
      ...(keyboard.length > 0 && { reply_markup: { inline_keyboard: keyboard } }),
    });
  }

  /**
   * A tap on a button: "Готово", "Через час" and "Завтра" under a task reminder, or
   * «Подтвердить», «Отмена» and «Отменить» under an answer of the assistant. The tap is
   * confirmed with a short popup, and the message gets the outcome.
   */
  private async handleCallback(updateId: number, query: CallbackQuery) {
    const sender = BigInt(query.from.id);
    if (!(await this.access.isAllowed(sender))) {
      return;
    }

    const data = query.data ?? "";
    const task = TASK_CALLBACK.exec(data);
    const action = ACTION_CALLBACK.exec(data);
    if ((!task && !action) || !(await this.markProcessed(BigInt(updateId)))) {
      await this.answerCallback(query.id);
      return;
    }

    let outcome: string;
    try {
      outcome = task
        ? await this.runTaskAction(sender, task[1] as TaskAction, task[2])
        : await this.assistant.resolveAction(sender, action![2], !action![1]);
    } catch {
      this.logger.warn("Button tap failed");
      await this.db.botUpdate.delete({ where: { updateId: BigInt(updateId) } });
      await this.answerCallback(query.id, TAP_FAILED_TEXT);
      return;
    }

    await this.answerCallback(query.id, outcome);

    if (query.message) {
      const buttons = task
        ? this.appButtons(["tasks"])
        : otherButtons(query.message.reply_markup?.inline_keyboard ?? [], action![2]);

      await this.call("editMessageText", {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        text: [query.message.text, outcome].filter(Boolean).join("\n\n"),
        reply_markup: { inline_keyboard: buttons },
      }).catch(() => this.logger.warn("Could not update the message after a tap"));
    }
  }

  /** Applies a task button and returns what happened, e.g. "⏰ Напомню в 15:30". */
  private async runTaskAction(sender: bigint, action: TaskAction, taskId: string) {
    const task = await this.tasks.findForTelegram(sender, taskId);
    if (!task) {
      return TASK_GONE_TEXT;
    }

    const ownerId = task.owner.id;
    const now = DateTime.now().setZone(task.owner.timezone);

    if (action === "done") {
      // A repeating task has already moved on to its next date when the reminder was sent.
      if (task.repeat === "none") {
        await this.tasks.complete(ownerId, task.id);
      }

      return "✅ Выполнено";
    }

    if (action === "hour") {
      const until = now.plus({ hours: SNOOZE_HOURS });
      await this.tasks.snooze(ownerId, task.id, until.toJSDate());

      return `⏰ Напомню в ${until.toFormat("HH:mm")}`;
    }

    const [hour, minute] = task.dueTime
      ? task.dueTime.split(":").map(Number)
      : [ALL_DAY_REMIND_HOUR, 0];
    const until = now.plus({ days: 1 }).set({ hour, minute, second: 0, millisecond: 0 });
    await this.tasks.snooze(ownerId, task.id, until.toJSDate());

    return `⏰ Напомню завтра в ${until.toFormat("HH:mm")}`;
  }

  private async answerCallback(queryId: string, text?: string) {
    await this.call("answerCallbackQuery", {
      callback_query_id: queryId,
      ...(text && { text }),
    }).catch(() => this.logger.warn("Could not answer a button tap"));
  }

  /** One button per deployed mini app (all of them by default), each on its own row. */
  private appButtons(only: MiniApp[] = ["wallet", "nutrition", "tasks"]): InlineButton[][] {
    const apps: { id: MiniApp; text: string; url: string }[] = [
      { id: "wallet", text: "💳 Кошелёк", url: this.config.miniAppUrl },
      { id: "nutrition", text: "🥗 Питание", url: this.config.nutritionAppUrl },
      { id: "tasks", text: "📝 Задачи", url: this.config.tasksAppUrl },
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
          allowed_updates: ALLOWED_UPDATES,
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

  private isPrivateChat(message: Message) {
    return (
      message.from !== undefined &&
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

/** What the draft says before the work starts. */
function firstProgress(message: Message) {
  if (message.voice ?? message.audio) {
    return ACCEPTED_TEXT;
  }

  return message.photo ? PHOTO_TEXT : THINKING;
}

/** Text that is not a /command. */
function isPlainText(text: string) {
  return text.trim().length > 0 && !text.startsWith("/");
}

function isTooLong(speech: SpeechFile) {
  return (speech.duration ?? 0) > MAX_VOICE_SECONDS || (speech.file_size ?? 0) > MAX_VOICE_BYTES;
}

function longSide(size: PhotoSize) {
  return Math.max(size.width, size.height);
}

/** The buttons of a message without the ones of a handled action. */
function otherButtons(keyboard: InlineButton[][], actionId: string) {
  return keyboard
    .map((row) =>
      row.filter(
        (button) => !("callback_data" in button) || !button.callback_data.endsWith(actionId),
      ),
    )
    .filter((row) => row.length > 0);
}

/** Splits a long answer at line breaks into parts Telegram accepts. */
export function splitText(text: string, limit: number) {
  const parts: string[] = [];
  let rest = text;

  while (rest.length > limit) {
    const cut = rest.lastIndexOf("\n", limit);
    const end = cut > 0 ? cut : limit;

    parts.push(rest.slice(0, end));
    rest = rest.slice(end).replace(/^\n/, "");
  }

  parts.push(rest);

  return parts;
}

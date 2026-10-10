import "reflect-metadata";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Prisma } from "@prisma/client";
import { readConfig } from "../src/config/app-config";
import { AccessService } from "../src/access/access.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { TasksService } from "../src/tasks/tasks.service";
import { TelegramBotService } from "../src/telegram/telegram-bot.service";
import { VoiceError, VoiceTransactionService } from "../src/voice/voice-transaction.service";

const config = readConfig({
  NODE_ENV: "production",
  AUTH_MODE: "telegram",
  APP_ORIGIN: "https://wallet.example",
  DATABASE_URL: "postgresql://localhost/wallet",
  BOT_TOKEN: "123:token",
  OWNER_TELEGRAM_ID: "123",
});
const update = {
  update_id: 42,
  message: { text: "/start", from: { id: 123 }, chat: { id: 123, type: "private" } },
};
const noVoice = { enabled: false } as unknown as VoiceTransactionService;
const noTasks = {} as unknown as TasksService;
const ADMIN_ID = 123n;
/** In-memory stand-in for AccessService: 123 is the administrator, `granted` holds the rest. */
function accessControl(granted: bigint[] = []) {
  const list = new Set(granted);
  return {
    list,
    isAdmin: (id: bigint) => id === ADMIN_ID,
    isAllowed: async (id: bigint) => id === ADMIN_ID || list.has(id),
    allowedIds: async () => [ADMIN_ID, ...list],
    grant: async (id: bigint) => !list.has(id) && Boolean(list.add(id)),
    revoke: async (id: bigint) => list.delete(id),
  };
}
const access = accessControl() as unknown as AccessService;
function database() {
  const ids = new Set<bigint>();
  return {
    ids,
    botUpdate: {
      async create({ data }: { data: { updateId: bigint } }) {
        if (ids.has(data.updateId))
          throw new Prisma.PrismaClientKnownRequestError("Duplicate", {
            code: "P2002",
            clientVersion: "6.19.0",
          });
        ids.add(data.updateId);
      },
      async delete({ where }: { where: { updateId: bigint } }) {
        ids.delete(where.updateId);
      },
    },
  };
}

test("polling deletes webhook, acknowledges processed updates and aborts on shutdown", async (t) => {
  const db = database(),
    calls: { method: string; body: Record<string, unknown> }[] = [];
  let waiting!: () => void;
  const blocked = new Promise<void>((resolve) => {
    waiting = resolve;
  });
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const method = url.split("/").at(-1)!;
    calls.push({ method, body: JSON.parse(String(options.body)) });
    if (method === "getUpdates" && calls.filter((c) => c.method === method).length === 2) {
      waiting();
      return new Promise<Response>((_resolve, reject) =>
        options.signal!.addEventListener("abort", () => reject(new Error("Stopped")), {
          once: true,
        }),
      );
    }
    return Response.json({ ok: true, result: method === "getUpdates" ? [update] : true });
  });
  const bot = new TelegramBotService(
    db as unknown as PrismaService,
    config,
    noVoice,
    access,
    noTasks,
  );
  try {
    await bot.onApplicationBootstrap();
    await blocked;
    assert.deepEqual(
      calls.map((c) => c.method),
      ["deleteWebhook", "getUpdates", "sendMessage", "getUpdates"],
    );
    assert.equal(calls[0].body.drop_pending_updates, false);
    assert.equal(calls[3].body.offset, 43);
    assert.deepEqual(calls[1].body.allowed_updates, ["message", "callback_query"]);
  } finally {
    await bot.onModuleDestroy();
  }
});

test("only owner /start is answered; duplicates are ignored and failed sends can be retried", async (t) => {
  const db = database();
  let sends = 0,
    fail = true;
  t.mock.method(globalThis, "fetch", async () => {
    sends++;
    return Response.json({ ok: !fail, result: true });
  });
  const bot = new TelegramBotService(
    db as unknown as PrismaService,
    config,
    noVoice,
    access,
    noTasks,
  );
  await bot.handleUpdate({ ...update, message: { ...update.message, from: { id: 999 } } });
  await bot.handleUpdate({
    ...update,
    message: { ...update.message, chat: { id: 123, type: "group" } },
  });
  assert.equal(sends, 0);
  await assert.rejects(bot.handleUpdate(update));
  assert.equal(db.ids.size, 0);
  fail = false;
  await bot.handleUpdate(update);
  await bot.handleUpdate(update);
  assert.equal(sends, 2);
  assert.equal(db.ids.size, 1);
});

test("local development does not start the Telegram bot", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected call");
  });
  const bot = new TelegramBotService(
    database() as unknown as PrismaService,
    { ...config, dev: true },
    noVoice,
    access,
    noTasks,
  );
  await bot.onApplicationBootstrap();
  await bot.onModuleDestroy();
  assert.equal(fetch.mock.callCount(), 0);
});

test("/start shows a button for every deployed mini app", async (t) => {
  const keyboards: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    keyboards.push(JSON.parse(String(options.body)).reply_markup.inline_keyboard);
    return Response.json({ ok: true, result: true });
  });

  await new TelegramBotService(
    database() as unknown as PrismaService,
    config,
    noVoice,
    access,
    noTasks,
  ).handleUpdate(update);
  const withNutrition = { ...config, nutritionAppUrl: "https://nutrition.example" };
  await new TelegramBotService(
    database() as unknown as PrismaService,
    withNutrition,
    noVoice,
    access,
    noTasks,
  ).handleUpdate(update);

  assert.deepEqual(keyboards, [
    [[{ text: "💳 Кошелёк", web_app: { url: config.miniAppUrl } }]],
    [
      [{ text: "💳 Кошелёк", web_app: { url: config.miniAppUrl } }],
      [{ text: "🥗 Питание", web_app: { url: "https://nutrition.example" } }],
    ],
  ]);
});

const voiceUpdate = {
  update_id: 77,
  message: {
    voice: { file_id: "file-1", duration: 4, file_size: 20_000 },
    from: { id: 123 },
    chat: { id: 123, type: "private" },
  },
};

function mockTelegram(t: import("node:test").TestContext) {
  const sent: string[] = [];
  const edited: string[] = [];
  const silent: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
    if (url.includes("/file/bot")) {
      return new Response(new Uint8Array([1, 2, 3]));
    }
    const method = url.split("/").at(-1)!;
    const body = JSON.parse(String(options?.body));
    if (method === "sendMessage") {
      sent.push(body.text);
      silent.push(body.disable_notification);
    }
    if (method === "editMessageText") {
      assert.equal(body.message_id, 500);
      edited.push(body.text);
    }
    const results: Record<string, unknown> = {
      getFile: { file_path: "voice/a.oga" },
      sendMessage: { message_id: 500 },
    };
    return Response.json({ ok: true, result: results[method] ?? true });
  });
  return { sent, edited, silent };
}

test("a voice message is acknowledged, recorded once and the result is sent back", async (t) => {
  const { sent, edited, silent } = mockTelegram(t);
  const recorded: { key: string; filename: string; size: number }[] = [];
  const voice = {
    enabled: true,
    async record(input: {
      key: string;
      filename: string;
      audio: Buffer;
      onStage: (stage: "parsing") => Promise<void>;
    }) {
      await input.onStage("parsing");
      recorded.push({ key: input.key, filename: input.filename, size: input.audio.length });
      return "Расход 45 000 сум за обед записан";
    },
  } as unknown as VoiceTransactionService;
  const bot = new TelegramBotService(
    database() as unknown as PrismaService,
    config,
    voice,
    access,
    noTasks,
  );

  await bot.handleUpdate(voiceUpdate);
  await bot.handleUpdate(voiceUpdate);

  assert.deepEqual(sent, ["Принято в обработку…"]);
  assert.deepEqual(edited, [
    "Распознаём голос…",
    "Разбираем сообщение…",
    "Расход 45 000 сум за обед записан",
  ]);
  assert.deepEqual(silent, [true]);
  assert.deepEqual(recorded, [{ key: "telegram-voice-77", filename: "voice.ogg", size: 3 }]);
});

test("voice failures are reported in the chat; strangers and long recordings are not processed", async (t) => {
  const { sent, edited, silent } = mockTelegram(t);
  const voice = {
    enabled: true,
    async record() {
      throw new VoiceError("Не понял");
    },
  } as unknown as VoiceTransactionService;
  const bot = new TelegramBotService(
    database() as unknown as PrismaService,
    config,
    voice,
    access,
    noTasks,
  );

  await bot.handleUpdate(voiceUpdate);
  // The status turns into "failed", and the reason arrives as a separate message with sound.
  assert.deepEqual(sent, ["Принято в обработку…", "Не понял\nНичего не записано."]);
  assert.deepEqual(edited, ["Распознаём голос…", "Не удалось распознать"]);
  assert.deepEqual(silent, [true, false]);

  sent.length = 0;
  await bot.handleUpdate({
    update_id: 78,
    message: { ...voiceUpdate.message, voice: { file_id: "x", duration: 600 } },
  });
  assert.deepEqual(sent, [
    "Сообщение слишком длинное. Запишите короче, до двух минут\nНичего не записано.",
  ]);

  sent.length = 0;
  await bot.handleUpdate({
    update_id: 79,
    message: { ...voiceUpdate.message, from: { id: 999 } },
  });
  assert.deepEqual(sent, []);
});

test("voice commands report that they are not configured", async (t) => {
  const { sent } = mockTelegram(t);
  const bot = new TelegramBotService(
    database() as unknown as PrismaService,
    config,
    noVoice,
    access,
    noTasks,
  );
  await bot.handleUpdate(voiceUpdate);
  assert.deepEqual(sent, ["Голосовые команды не настроены на сервере.\nНичего не записано."]);
});

function accessFixture(t: TestContext) {
  const sent: { chat: number; text: string }[] = [];

  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    sent.push({ chat: body.chat_id, text: body.text });
    return Response.json({ ok: true, result: { message_id: 1 } });
  });

  const control = accessControl();
  const bot = new TelegramBotService(
    database() as unknown as PrismaService,
    config,
    noVoice,
    control as unknown as AccessService,
    noTasks,
  );

  let updateId = 100;
  const say = (from: number, text: string) =>
    bot.handleUpdate({
      update_id: updateId++,
      message: { text, from: { id: from }, chat: { id: from, type: "private" } },
    });

  return { sent, control, say };
}

test("the administrator grants and revokes access with commands", async (t) => {
  const { sent, control, say } = accessFixture(t);

  await say(123, "/access");
  await say(123, "/access 555");
  await say(123, "/access 555");
  await say(123, "/access abc");
  assert.deepEqual(
    sent.map((m) => m.text),
    [
      "Доступ пока никому не выдан. Чтобы открыть: /access 123456789",
      "Доступ выдан: 555",
      "Вам открыт доступ. Нажмите /start, чтобы начать.",
      "У 555 уже есть доступ",
      "Укажите Telegram id числом, например: /access 123456789",
    ],
  );
  assert.equal(sent[2].chat, 555);
  assert.ok(control.list.has(555n));

  sent.length = 0;

  await say(123, "/access");
  await say(123, "/revoke 555");
  await say(123, "/revoke 123");
  assert.deepEqual(
    sent.map((m) => m.text),
    ["Доступ есть у:\n555", "Доступ отозван: 555", "Свой доступ отозвать нельзя"],
  );
  assert.equal(control.list.size, 0);
});

test("strangers get no reply, and access commands work only for the administrator", async (t) => {
  const { sent, control, say } = accessFixture(t);
  control.list.add(555n);

  await say(999, "/start");
  await say(999, "/access 999");
  await say(555, "/access 999");
  await say(555, "/revoke 555");

  assert.equal(sent.length, 0);
  assert.deepEqual([...control.list], [555n]);

  await say(555, "/start");

  assert.equal(sent.length, 1);
  assert.equal(sent[0].chat, 555);
});

test("/help explains the bot to allowed users and adds the access commands for the administrator", async (t) => {
  const { sent, control, say } = accessFixture(t);
  control.list.add(555n);

  await say(555, "/help");
  await say(123, "/help");
  await say(999, "/help");

  assert.equal(sent.length, 2);
  assert.equal(sent[0].chat, 555);
  assert.match(sent[0].text, /Голосовые сообщения/);
  assert.match(sent[0].text, /Кошелёк/);
  assert.doesNotMatch(sent[0].text, /\/access/);
  assert.match(sent[1].text, /\/access/);
});

const TASK_ID = "11111111-1111-4111-8111-111111111111";

function callbackUpdate(updateId: number, data: string, from = 123) {
  return {
    update_id: updateId,
    callback_query: {
      id: `q${updateId}`,
      from: { id: from },
      data,
      message: { message_id: 900, chat: { id: from }, text: "🔔 Позвонить в банк" },
    },
  };
}

function taskButtonsFixture(t: TestContext, repeat = "none") {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const completed: string[] = [];
  const snoozed: Date[] = [];

  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls.push({ method: url.split("/").at(-1)!, body: JSON.parse(String(options.body)) });
    return Response.json({ ok: true, result: true });
  });

  const tasks = {
    async findForTelegram(telegramId: bigint, id: string) {
      if (telegramId !== 123n || id !== TASK_ID) {
        return null;
      }

      return {
        id,
        repeat,
        dueTime: "10:00",
        owner: { id: "owner", timezone: "Asia/Tashkent" },
      };
    },
    async complete(_owner: string, id: string) {
      completed.push(id);
    },
    async snooze(_owner: string, _id: string, until: Date) {
      snoozed.push(until);
    },
  } as unknown as TasksService;

  const bot = new TelegramBotService(
    database() as unknown as PrismaService,
    { ...config, tasksAppUrl: "https://tasks.example" },
    noVoice,
    access,
    tasks,
  );

  return { bot, calls, completed, snoozed };
}

test("the Done button completes a one-off task once and replaces the buttons", async (t) => {
  const { bot, calls, completed } = taskButtonsFixture(t);

  await bot.handleUpdate(callbackUpdate(500, `task:done:${TASK_ID}`));
  await bot.handleUpdate(callbackUpdate(500, `task:done:${TASK_ID}`));

  assert.deepEqual(completed, [TASK_ID]);
  assert.deepEqual(
    calls.map((call) => call.method),
    ["answerCallbackQuery", "editMessageText", "answerCallbackQuery"],
  );
  assert.equal(calls[0].body.text, "✅ Выполнено");
  assert.equal(calls[1].body.text, "🔔 Позвонить в банк\n\n✅ Выполнено");
  assert.deepEqual(calls[1].body.reply_markup, {
    inline_keyboard: [[{ text: "📝 Задачи", web_app: { url: "https://tasks.example" } }]],
  });
});

test("a repeating task is not completed again; snooze buttons put the reminder off", async (t) => {
  const { bot, calls, completed, snoozed } = taskButtonsFixture(t, "daily");

  await bot.handleUpdate(callbackUpdate(501, `task:done:${TASK_ID}`));
  await bot.handleUpdate(callbackUpdate(502, `task:hour:${TASK_ID}`));
  await bot.handleUpdate(callbackUpdate(503, `task:tomorrow:${TASK_ID}`));

  assert.deepEqual(completed, []);
  assert.equal(snoozed.length, 2);

  const inAnHour = Date.now() + 60 * 60 * 1000;
  assert.ok(Math.abs(snoozed[0].getTime() - inAnHour) < 5000);
  assert.match(String(calls[2].body.text), /^⏰ Напомню в \d{2}:\d{2}$/);
  assert.equal(calls[4].body.text, "⏰ Напомню завтра в 10:00");
});

test("strangers' taps are ignored and someone else's task is not found", async (t) => {
  const { bot, calls, completed } = taskButtonsFixture(t);

  await bot.handleUpdate(callbackUpdate(510, `task:done:${TASK_ID}`, 999));
  assert.equal(calls.length, 0);

  await bot.handleUpdate(callbackUpdate(511, "task:done:22222222-2222-4222-8222-222222222222"));
  assert.deepEqual(completed, []);
  assert.equal(calls[0].body.text, "Задача уже удалена");
});

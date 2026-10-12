import "reflect-metadata";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Prisma } from "@prisma/client";
import { readConfig } from "../src/config/app-config";
import { AccessService } from "../src/access/access.service";
import {
  AssistantError,
  AssistantReply,
  AssistantService,
  ChatInput,
} from "../src/assistant/assistant.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { TasksService } from "../src/tasks/tasks.service";
import { TelegramBotService } from "../src/telegram/telegram-bot.service";
import { TelegramWebhookController } from "../src/telegram/telegram-webhook.controller";

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
const noAssistant = { enabled: false } as unknown as AssistantService;
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

test("polling checks for a webhook, acknowledges processed updates and aborts on shutdown", async (t) => {
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
    noAssistant,
    access,
    noTasks,
  );
  try {
    await bot.onApplicationBootstrap();
    await blocked;
    assert.deepEqual(
      calls.map((c) => c.method),
      ["getWebhookInfo", "getUpdates", "sendMessage", "getUpdates"],
    );
    assert.equal(calls[3].body.offset, 43);
    assert.deepEqual(calls[1].body.allowed_updates, [
      "message",
      "callback_query",
      "stopped_message_generation",
    ]);
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
    noAssistant,
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
    noAssistant,
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
    noAssistant,
    access,
    noTasks,
  ).handleUpdate(update);
  const withNutrition = { ...config, nutritionAppUrl: "https://nutrition.example" };
  await new TelegramBotService(
    database() as unknown as PrismaService,
    withNutrition,
    noAssistant,
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

const SECRET = "s".repeat(32);
const webhookConfig = {
  ...config,
  webhook: { url: "https://api.example/api/telegram/webhook", secret: SECRET },
};

const chat = { from: { id: 123 }, chat: { id: 123, type: "private" } };
const voiceUpdate = {
  update_id: 77,
  message: { voice: { file_id: "voice-1", duration: 4, file_size: 20_000 }, ...chat },
};
const textUpdate = { update_id: 80, message: { text: "сколько я потратил?", ...chat } };

/** Telegram stand-in: getFile answers `<id>.jpg` paths, downloads return `files[id]`. */
/** `refuseHtml` makes Telegram refuse formatted messages, as with broken markup. */
function mockTelegram(t: TestContext, files: Record<string, number[]> = {}, refuseHtml = false) {
  const calls: { method: string; body: Record<string, unknown> }[] = [];

  t.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
    if (url.includes("/file/bot")) {
      const id = url.split("/").at(-1)!.split(".")[0];
      return new Response(new Uint8Array(files[id] ?? [1, 2, 3]));
    }

    const method = url.split("/").at(-1)!;
    const body = JSON.parse(String(options?.body));
    calls.push({ method, body });

    if (method === "getFile") {
      const extension = body.file_id.startsWith("voice") ? "oga" : "jpg";
      return Response.json({
        ok: true,
        result: { file_path: `files/${body.file_id}.${extension}` },
      });
    }

    if (refuseHtml && body.parse_mode === "HTML") {
      return Response.json(
        { ok: false, description: "Bad Request: can't parse entities" },
        { status: 400 },
      );
    }

    const result = method === "sendMessage" ? { message_id: 500 } : true;
    return Response.json({ ok: true, result });
  });

  const of = (method: string) => calls.filter((call) => call.method === method);

  return {
    calls,
    of,
    sent: () => of("sendMessage").map((call) => call.body.text),
    silent: () => of("sendMessage").map((call) => call.body.disable_notification),
    drafts: () => of("sendMessageDraft").map((call) => call.body),
  };
}

function fakeAssistant(answer: (input: ChatInput) => Promise<AssistantReply>) {
  const inputs: ChatInput[] = [];
  const resolved: { telegramId: bigint; id: string; approve: boolean }[] = [];
  const restarted: bigint[] = [];

  const assistant = {
    enabled: true,
    async reply(input: ChatInput) {
      inputs.push(input);
      return answer(input);
    },
    async resolveAction(telegramId: bigint, id: string, approve: boolean) {
      resolved.push({ telegramId, id, approve });
      return approve ? "🗑 Удалено" : "✖️ Отменено";
    },
    async restartChat(telegramId: bigint) {
      restarted.push(telegramId);
    },
  };

  return { assistant: assistant as unknown as AssistantService, inputs, resolved, restarted };
}

function chatBot(assistant: AssistantService, botConfig = config) {
  return new TelegramBotService(
    database() as unknown as PrismaService,
    botConfig,
    assistant,
    access,
    noTasks,
  );
}

const UNDO = "act:55555555-5555-4555-8555-555555555555";

test("a voice message shows a draft at once, is answered once and gets the answer's buttons", async (t) => {
  const telegram = mockTelegram(t);
  const { assistant, inputs } = fakeAssistant(async (input) => {
    input.onProgress!("Распознаём голос…");
    input.onProgress!("Думаю…");

    return {
      text: "Расход 45 000 сум за обед записан · Кафе",
      buttons: [[{ text: "↩️ Отменить", data: UNDO }]],
    };
  });
  const bot = chatBot(assistant);

  await bot.handleUpdate(voiceUpdate);
  await bot.handleUpdate(voiceUpdate);

  // Later progress within the update interval is merged; the answer replaces the draft anyway.
  assert.deepEqual(telegram.drafts(), [
    { chat_id: 123, draft_id: 1, text: "Принято в обработку…", parse_mode: "HTML" },
  ]);
  assert.deepEqual(telegram.sent(), ["Расход 45 000 сум за обед записан · Кафе"]);
  assert.deepEqual(telegram.silent(), [true]);
  assert.deepEqual(telegram.of("sendMessage")[0].body.reply_markup, {
    inline_keyboard: [[{ text: "↩️ Отменить", callback_data: UNDO }]],
  });

  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].key, "telegram-77");
  assert.equal(inputs[0].audio?.filename, "voice.ogg");
  assert.equal(inputs[0].audio?.data.length, 3);
  assert.equal(inputs[0].photo, null);
});

test("a text message shows the assistant's thinking line, then the answer", async (t) => {
  const telegram = mockTelegram(t);
  const { assistant, inputs } = fakeAssistant(async (input) => {
    input.onProgress!("Думаю…");

    return { text: "В октябре потрачено 3 800 000 сум", buttons: [] };
  });

  await chatBot(assistant).handleUpdate(textUpdate);

  assert.deepEqual(telegram.drafts(), [
    { chat_id: 123, draft_id: 1, text: "Думаю…", parse_mode: "HTML" },
  ]);
  assert.deepEqual(telegram.sent(), ["В октябре потрачено 3 800 000 сум"]);
  assert.equal(telegram.of("sendMessage")[0].body.reply_markup, undefined);
  assert.equal(inputs[0].text, "сколько я потратил?");
  assert.equal(inputs[0].audio, null);
  assert.equal(inputs[0].key, "telegram-80");
});

test("a photo goes in a size fit for recognition, with a small copy for the diary", async (t) => {
  const telegram = mockTelegram(t, { l: [1, 2, 3, 4], m: [5, 6] });
  const { assistant, inputs } = fakeAssistant(async () => ({ text: "🍽 Записал", buttons: [] }));

  await chatBot(assistant).handleUpdate({
    update_id: 81,
    message: {
      ...chat,
      caption: "обед",
      photo: [
        { file_id: "s", width: 90, height: 68 },
        { file_id: "m", width: 320, height: 240 },
        { file_id: "l", width: 1280, height: 960 },
        { file_id: "xl", width: 2560, height: 1920 },
      ],
    },
  });

  assert.equal(telegram.drafts()[0].text, "Смотрю фото…");
  assert.equal(inputs[0].text, "обед");
  assert.deepEqual([...inputs[0].photo!.full], [1, 2, 3, 4]);
  assert.deepEqual([...inputs[0].photo!.thumbnail], [5, 6]);
});

test("a long answer is split at a line break; the buttons go under the last part", async (t) => {
  const telegram = mockTelegram(t);
  const first = "а".repeat(4000);
  const second = "б".repeat(200);
  const { assistant } = fakeAssistant(async () => ({
    text: `${first}\n${second}`,
    buttons: [[{ text: "↩️ Отменить", data: UNDO }]],
  }));

  await chatBot(assistant).handleUpdate(textUpdate);

  assert.deepEqual(telegram.sent(), [first, second]);
  assert.equal(telegram.of("sendMessage")[0].body.reply_markup, undefined);
  assert.deepEqual(telegram.of("sendMessage")[1].body.reply_markup, {
    inline_keyboard: [[{ text: "↩️ Отменить", callback_data: UNDO }]],
  });
});

test("failures are reported with sound; unknown commands and strangers get nothing", async (t) => {
  const telegram = mockTelegram(t);
  let failure: Error = new AssistantError("Не понял");
  const { assistant, inputs } = fakeAssistant(async () => {
    throw failure;
  });
  const bot = chatBot(assistant);

  await bot.handleUpdate(textUpdate);
  assert.deepEqual(telegram.sent(), ["Не понял\nНичего не записано."]);
  assert.deepEqual(telegram.silent(), [false]);

  // Something unexpected may have happened after a record: no promise that nothing was saved.
  failure = new Error("Boom");
  await bot.handleUpdate({ ...textUpdate, update_id: 82 });
  assert.equal(telegram.sent().at(-1), "Не удалось обработать сообщение. Попробуйте ещё раз");

  telegram.calls.length = 0;
  await bot.handleUpdate({ update_id: 83, message: { text: "/unknown", ...chat } });
  await bot.handleUpdate({ update_id: 84, message: { ...textUpdate.message, from: { id: 999 } } });
  await bot.handleUpdate({
    update_id: 85,
    message: { ...chat, voice: { file_id: "voice-2", duration: 600 } },
  });

  assert.deepEqual(telegram.sent(), [
    "Сообщение слишком длинное. Запишите короче, до двух минут\nНичего не записано.",
  ]);
  assert.deepEqual(telegram.drafts(), []);
  assert.equal(inputs.length, 2);
});

test("without the assistant configured the bot says so", async (t) => {
  const telegram = mockTelegram(t);

  await chatBot(noAssistant).handleUpdate(voiceUpdate);

  assert.deepEqual(telegram.sent(), ["Ассистент не настроен на сервере.\nНичего не записано."]);
});

test("the assistant's Markdown goes to Telegram as HTML", async (t) => {
  const telegram = mockTelegram(t);
  const { assistant } = fakeAssistant(async () => ({
    text: "Осталось **1 200 000 сум** <из бюджета>\n\nИсточники:\n• [Афиша](https://afisha.uz/ru)",
    buttons: [],
  }));

  await chatBot(assistant).handleUpdate(textUpdate);

  const [message] = telegram.of("sendMessage");
  assert.equal(message.body.parse_mode, "HTML");
  assert.equal(
    message.body.text,
    'Осталось <b>1 200 000 сум</b> &lt;из бюджета&gt;\n\nИсточники:\n• <a href="https://afisha.uz/ru">Афиша</a>',
  );
});

test("an answer Telegram refuses as HTML is sent again as plain text", async (t) => {
  const telegram = mockTelegram(t, {}, true);
  const { assistant } = fakeAssistant(async () => ({
    text: "Осталось **1 200 000 сум**, [подробнее](https://example.uz)",
    buttons: [],
  }));

  await chatBot(assistant).handleUpdate(textUpdate);

  const messages = telegram.of("sendMessage");
  assert.equal(messages.length, 2);
  assert.equal(messages[1].body.parse_mode, undefined);
  assert.equal(messages[1].body.text, "Осталось 1 200 000 сум, подробнее (https://example.uz)");
});

test("/new starts the conversation over", async (t) => {
  const telegram = mockTelegram(t);
  const { assistant, restarted, inputs } = fakeAssistant(async () => ({ text: "", buttons: [] }));

  await chatBot(assistant).handleUpdate({ update_id: 86, message: { text: "/new", ...chat } });

  assert.deepEqual(restarted, [123n]);
  assert.deepEqual(telegram.sent(), ["Начнём заново. Что нужно сделать или узнать?"]);
  assert.equal(inputs.length, 0);
});

test("in webhook mode the draft has a stop button, and a tap aborts the answer at once", async (t) => {
  const telegram = mockTelegram(t);
  let started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  const { assistant } = fakeAssistant(async (input) => {
    input.onProgress!("Думаю…");
    started();
    await new Promise((resolve) => input.signal!.addEventListener("abort", resolve));

    return { text: "⏹ Остановлено", buttons: [] };
  });
  const bot = chatBot(assistant, webhookConfig);

  const answered = bot.enqueue(textUpdate);
  await running;
  // The stop is not queued behind the answer it should stop.
  void bot.enqueue({
    update_id: 87,
    stopped_message_generation: { chat: { id: 123 }, draft_id: 1 },
  });
  await answered;

  assert.deepEqual(telegram.drafts(), [
    { chat_id: 123, draft_id: 1, text: "Думаю…", parse_mode: "HTML", can_stop: true },
  ]);
  assert.deepEqual(telegram.sent(), ["⏹ Остановлено"]);
});

const ACTION_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";
const confirmKeyboard = [
  [
    { text: "✅ 1", callback_data: `act:${ACTION_ID}` },
    { text: "✖️ 1", callback_data: `act-no:${ACTION_ID}` },
  ],
  [
    { text: "✅ 2", callback_data: `act:${OTHER_ID}` },
    { text: "✖️ 2", callback_data: `act-no:${OTHER_ID}` },
  ],
];

test("confirmation buttons run the action once and leave the other buttons in place", async (t) => {
  const telegram = mockTelegram(t);
  const { assistant, resolved } = fakeAssistant(async () => ({ text: "", buttons: [] }));
  const bot = chatBot(assistant);
  const tap = (updateId: number, data: string, from = 123) => ({
    update_id: updateId,
    callback_query: {
      id: `q${updateId}`,
      from: { id: from },
      data,
      message: {
        message_id: 900,
        chat: { id: from },
        text: "Ждут подтверждения",
        reply_markup: { inline_keyboard: confirmKeyboard },
      },
    },
  });

  await bot.handleUpdate(tap(600, `act:${ACTION_ID}`));
  await bot.handleUpdate(tap(600, `act:${ACTION_ID}`));
  await bot.handleUpdate(tap(601, `act-no:${OTHER_ID}`));
  await bot.handleUpdate(tap(602, `act:${OTHER_ID}`, 999));

  assert.deepEqual(resolved, [
    { telegramId: 123n, id: ACTION_ID, approve: true },
    { telegramId: 123n, id: OTHER_ID, approve: false },
  ]);

  const [answer] = telegram.of("answerCallbackQuery");
  const [edit] = telegram.of("editMessageText");
  assert.equal(answer.body.text, "🗑 Удалено");
  assert.equal(edit.body.text, "Ждут подтверждения\n\n🗑 Удалено");
  assert.deepEqual(edit.body.reply_markup, { inline_keyboard: [confirmKeyboard[1]] });
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
    noAssistant,
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
  assert.match(sent[0].text, /Ассистент/);
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

/** `refusedOnce` lists methods Telegram refuses the first time they are called. */
function taskButtonsFixture(t: TestContext, repeat = "none", refusedOnce: string[] = []) {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const completed: string[] = [];
  const snoozed: Date[] = [];
  const refused = new Set(refusedOnce);

  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const method = url.split("/").at(-1)!;

    calls.push({ method, body: JSON.parse(String(options.body)) });

    if (refused.delete(method)) {
      return Response.json({ ok: false, description: "Bad Request" }, { status: 400 });
    }

    return Response.json({ ok: true, result: true });
  });

  const tasks = {
    async findForTelegram(telegramId: bigint, id: string) {
      if (telegramId !== 123n || id !== TASK_ID) {
        return null;
      }

      return {
        id,
        title: "Позвонить в банк",
        note: "Номер в заметках",
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
    noAssistant,
    access,
    tasks,
  );

  return { bot, calls, completed, snoozed };
}

test("the Done button completes a one-off task once and rewrites the reminder", async (t) => {
  const { bot, calls, completed } = taskButtonsFixture(t);

  await bot.handleUpdate(callbackUpdate(500, `task:done:${TASK_ID}`));
  await bot.handleUpdate(callbackUpdate(500, `task:done:${TASK_ID}`));

  assert.deepEqual(completed, [TASK_ID]);
  assert.deepEqual(
    calls.map((call) => call.method),
    ["answerCallbackQuery", "editMessageText", "answerCallbackQuery"],
  );
  assert.equal(calls[0].body.text, "✅ Выполнено");
  assert.equal(calls[1].body.text, "✅ Выполнено: Позвонить в банк\n\nНомер в заметках");
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
  assert.match(String(calls[2].body.text), /^⏰ Напомню через час, в \d{2}:\d{2}$/);
  assert.match(
    String(calls[3].body.text),
    /^⏰ Напомню через час, в \d{2}:\d{2}: Позвонить в банк\n\nНомер в заметках$/,
  );
  assert.equal(calls[4].body.text, "⏰ Напомню завтра в 10:00");
  assert.equal(
    calls[5].body.text,
    "⏰ Напомню завтра в 10:00: Позвонить в банк\n\nНомер в заметках",
  );
});

test("a reminder Telegram does not let rewrite with the app button loses its buttons", async (t) => {
  const { bot, calls } = taskButtonsFixture(t, "none", ["editMessageText"]);

  await bot.handleUpdate(callbackUpdate(504, `task:hour:${TASK_ID}`));

  const edits = calls.filter((call) => call.method === "editMessageText");
  assert.equal(edits.length, 2);
  assert.match(
    String(edits[1].body.text),
    /^⏰ Напомню через час, в \d{2}:\d{2}: Позвонить в банк/,
  );
  assert.deepEqual(edits[1].body.reply_markup, { inline_keyboard: [] });
});

test("strangers' taps are ignored and someone else's task is not found", async (t) => {
  const { bot, calls, completed } = taskButtonsFixture(t);

  await bot.handleUpdate(callbackUpdate(510, `task:done:${TASK_ID}`, 999));
  assert.equal(calls.length, 0);

  await bot.handleUpdate(callbackUpdate(511, "task:done:22222222-2222-4222-8222-222222222222"));
  assert.deepEqual(completed, []);
  assert.equal(calls[0].body.text, "Задача уже удалена");
});

function recordCalls(t: TestContext, results: Record<string, unknown> = {}) {
  const calls: { method: string; body: Record<string, unknown> }[] = [];

  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const method = url.split("/").at(-1)!;
    calls.push({ method, body: JSON.parse(String(options.body)) });

    return Response.json({ ok: true, result: results[method] ?? true });
  });

  return calls;
}

test("webhook mode registers the webhook with its secret and does not poll", async (t) => {
  const calls = recordCalls(t);
  const bot = new TelegramBotService(
    database() as unknown as PrismaService,
    webhookConfig,
    noAssistant,
    access,
    noTasks,
  );

  await bot.onApplicationBootstrap();
  await bot.onModuleDestroy();

  assert.deepEqual(
    calls.map((call) => call.method),
    ["setWebhook"],
  );
  assert.deepEqual(calls[0].body, {
    url: "https://api.example/api/telegram/webhook",
    secret_token: SECRET,
    allowed_updates: ["message", "callback_query", "stopped_message_generation"],
    drop_pending_updates: false,
  });
});

test("a local bot does not take over a token that has a webhook", async (t) => {
  const calls = recordCalls(t, { getWebhookInfo: { url: "https://api.example/hook" } });
  const bot = new TelegramBotService(
    database() as unknown as PrismaService,
    config,
    noAssistant,
    access,
    noTasks,
  );

  await bot.onApplicationBootstrap();
  await bot.onModuleDestroy();

  assert.deepEqual(
    calls.map((call) => call.method),
    ["getWebhookInfo"],
  );
});

test("webhook updates are handled one at a time, in order, and a failure does not stop the rest", async (t) => {
  recordCalls(t);
  const bot = new TelegramBotService(
    database() as unknown as PrismaService,
    webhookConfig,
    noAssistant,
    access,
    noTasks,
  );

  const handled: number[] = [];
  let running = 0;
  t.mock.method(bot, "handleUpdate", async (incoming: { update_id: number }) => {
    running++;
    assert.equal(running, 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;

    if (incoming.update_id === 2) {
      throw new Error("Boom");
    }

    handled.push(incoming.update_id);
  });

  void bot.enqueue({ update_id: 1 });
  void bot.enqueue({ update_id: 2 });
  await bot.enqueue({ update_id: 3 });

  assert.deepEqual(handled, [1, 3]);
});

test("the webhook accepts only requests signed with the secret", async () => {
  const queued: unknown[] = [];
  const bot = { enqueue: (update: unknown) => queued.push(update) };
  const controller = new TelegramWebhookController(
    webhookConfig,
    bot as unknown as TelegramBotService,
  );

  assert.throws(() => controller.receive(undefined, { update_id: 1 }), /Unauthorized/);
  assert.throws(() => controller.receive("wrong", { update_id: 1 }), /Unauthorized/);
  assert.deepEqual(controller.receive(SECRET, { update_id: 1 }), { ok: true });
  assert.deepEqual(queued, [{ update_id: 1 }]);

  const polling = new TelegramWebhookController(config, bot as unknown as TelegramBotService);
  assert.throws(() => polling.receive(SECRET, { update_id: 2 }), /Not Found/);
});

test("the webhook needs an HTTPS URL and a long secret", () => {
  const base = {
    NODE_ENV: "production",
    APP_ORIGIN: "https://wallet.example",
    DATABASE_URL: "postgresql://localhost/wallet",
    BOT_TOKEN: "123:token",
    OWNER_TELEGRAM_ID: "123",
  };

  assert.equal(readConfig(base).webhook, null);
  assert.throws(
    () => readConfig({ ...base, TELEGRAM_WEBHOOK_URL: "http://api.example/hook" }),
    /HTTPS/,
  );
  assert.throws(
    () => readConfig({ ...base, TELEGRAM_WEBHOOK_URL: "https://api.example/hook" }),
    /TELEGRAM_WEBHOOK_SECRET/,
  );
  assert.deepEqual(
    readConfig({
      ...base,
      TELEGRAM_WEBHOOK_URL: "https://api.example/hook",
      TELEGRAM_WEBHOOK_SECRET: SECRET,
    }).webhook,
    { url: "https://api.example/hook", secret: SECRET },
  );
});

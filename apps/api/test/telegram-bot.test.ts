import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { readConfig } from "../src/config/app-config";
import { PrismaService } from "../src/prisma/prisma.service";
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
  const bot = new TelegramBotService(db as unknown as PrismaService, config, noVoice);
  try {
    await bot.onApplicationBootstrap();
    await blocked;
    assert.deepEqual(
      calls.map((c) => c.method),
      ["deleteWebhook", "getUpdates", "sendMessage", "getUpdates"],
    );
    assert.equal(calls[0].body.drop_pending_updates, false);
    assert.equal(calls[3].body.offset, 43);
    assert.deepEqual(calls[1].body.allowed_updates, ["message"]);
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
  const bot = new TelegramBotService(db as unknown as PrismaService, config, noVoice);
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
  ).handleUpdate(update);
  const withNutrition = { ...config, nutritionAppUrl: "https://nutrition.example" };
  await new TelegramBotService(
    database() as unknown as PrismaService,
    withNutrition,
    noVoice,
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
    async record(input: { key: string; filename: string; audio: Buffer }) {
      recorded.push({ key: input.key, filename: input.filename, size: input.audio.length });
      return "Расход 45 000 сум за обед записан";
    },
  } as unknown as VoiceTransactionService;
  const bot = new TelegramBotService(database() as unknown as PrismaService, config, voice);

  await bot.handleUpdate(voiceUpdate);
  await bot.handleUpdate(voiceUpdate);

  assert.deepEqual(sent, ["Принято в обработку…"]);
  assert.deepEqual(edited, ["Расход 45 000 сум за обед записан"]);
  assert.deepEqual(silent, [true]);
  assert.deepEqual(recorded, [{ key: "telegram-voice-77", filename: "voice.ogg", size: 3 }]);
});

test("voice failures are reported in the chat; strangers and long recordings are not processed", async (t) => {
  const { sent, edited } = mockTelegram(t);
  const voice = {
    enabled: true,
    async record() {
      throw new VoiceError("Не понял");
    },
  } as unknown as VoiceTransactionService;
  const bot = new TelegramBotService(database() as unknown as PrismaService, config, voice);

  await bot.handleUpdate(voiceUpdate);
  assert.deepEqual(sent, ["Принято в обработку…"]);
  assert.deepEqual(edited, ["Не понял"]);

  sent.length = 0;
  await bot.handleUpdate({
    update_id: 78,
    message: { ...voiceUpdate.message, voice: { file_id: "x", duration: 600 } },
  });
  assert.deepEqual(sent, ["Сообщение слишком длинное. Запишите короче, до двух минут"]);

  sent.length = 0;
  await bot.handleUpdate({
    update_id: 79,
    message: { ...voiceUpdate.message, from: { id: 999 } },
  });
  assert.deepEqual(sent, []);
});

test("voice commands report that they are not configured", async (t) => {
  const { sent } = mockTelegram(t);
  const bot = new TelegramBotService(database() as unknown as PrismaService, config, noVoice);
  await bot.handleUpdate(voiceUpdate);
  assert.deepEqual(sent, ["Голосовые команды не настроены на сервере"]);
});

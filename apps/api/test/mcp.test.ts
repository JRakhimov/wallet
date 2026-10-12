import "reflect-metadata";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { AssistantReply, AssistantService } from "../src/assistant/assistant.service";
import { readConfig } from "../src/config/app-config";
import { McpController } from "../src/mcp/mcp.controller";
import { McpServerFactory } from "../src/mcp/mcp-server";
import { PrismaService } from "../src/prisma/prisma.service";
import { TelegramBotService } from "../src/telegram/telegram-bot.service";

const SECRET = "m".repeat(40);
const base = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://wallet.example",
  DATABASE_URL: "postgresql://localhost/wallet",
  BOT_TOKEN: "123:token",
  OWNER_TELEGRAM_ID: "123",
};

test("MCP is off without a secret and needs a long one", () => {
  assert.equal(readConfig(base).mcp, null);
  assert.throws(() => readConfig({ ...base, MCP_SECRET: "short" }), /MCP_SECRET/);
  assert.deepEqual(readConfig({ ...base, MCP_SECRET: SECRET }).mcp, { secret: SECRET });
});

test("without the right secret, or with MCP off, there is nothing at the address", async () => {
  const servers = {} as McpServerFactory;
  const on = new McpController(readConfig({ ...base, MCP_SECRET: SECRET }), servers);
  const off = new McpController(readConfig(base), servers);
  const res = {} as never;

  await assert.rejects(on.openStream("m".repeat(39) + "x", res), /Not Found/);
  await assert.rejects(on.openStream("short", res), /Not Found/);
  await assert.rejects(off.openStream(SECRET, res), /Not Found/);
});

test("a tool call goes to the administrator's data and its notice to the chat", async () => {
  const config = readConfig({ ...base, MCP_SECRET: SECRET });
  const calls: unknown[][] = [];
  const notices: { telegramId: bigint; reply: AssistantReply }[] = [];
  const notice = { text: "Через Home Assistant:\n• Записано", buttons: [] };

  const assistant = {
    toolSpecs: [],
    async callTool(...args: unknown[]) {
      calls.push(args);
      return { output: '{"recorded":"Записано"}', isError: false, notice };
    },
  };
  const bot = {
    async notify(telegramId: bigint, reply: AssistantReply) {
      notices.push({ telegramId, reply });
    },
  };
  const factory = new McpServerFactory(
    config,
    assistant as unknown as AssistantService,
    bot as unknown as TelegramBotService,
  );

  const result = await (
    factory as unknown as {
      call(name: string, args: unknown, client: string): Promise<unknown>;
    }
  ).call("add_operation", { amount: 1 }, "home-assistant");

  assert.deepEqual(calls, [[123n, "add_operation", { amount: 1 }, "Home Assistant"]]);
  assert.deepEqual(notices, [{ telegramId: 123n, reply: notice }]);
  assert.deepEqual(result, {
    content: [{ type: "text", text: '{"recorded":"Записано"}' }],
    isError: false,
  });
});

test("a notice waiting for confirmation comes with sound, a record silently", async (t: TestContext) => {
  const sent: { silent: unknown; markup: unknown }[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    sent.push({ silent: body.disable_notification, markup: body.reply_markup });
    return Response.json({ ok: true, result: { message_id: 1 } });
  });
  const bot = new TelegramBotService(
    {} as PrismaService,
    readConfig(base),
    {} as AssistantService,
    {} as never,
    {} as never,
  );

  await bot.notify(123n, { text: "Записано", buttons: [[{ text: "↩️ Отменить", data: "act:a" }]] });
  await bot.notify(123n, {
    text: "❓ Удалить?",
    buttons: [
      [
        { text: "✅ Подтвердить", data: "act:b" },
        { text: "✖️ Отмена", data: "act-no:b" },
      ],
    ],
  });

  assert.deepEqual(
    sent.map((message) => message.silent),
    [true, false],
  );
});

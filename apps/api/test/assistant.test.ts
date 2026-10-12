import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod/v4";
import { ActionsService } from "../src/assistant/actions.service";
import {
  AssistantModel,
  AssistantModelError,
  AssistantStoppedError,
  ModelAnswer,
  ModelRequest,
  TurnItem,
} from "../src/assistant/assistant-model";
import { AssistantError, AssistantService, ChatInput } from "../src/assistant/assistant.service";
import { HistoryService } from "../src/assistant/history.service";
import { MemoryService } from "../src/assistant/memory.service";
import { SYSTEM_PROMPT } from "../src/assistant/prompt";
import { AssistantSettingsService, DEFAULT_SETTINGS } from "../src/assistant/settings.service";
import { THINKING_TEXTS } from "../src/assistant/thinking";
import { AssistantToolbox } from "../src/assistant/tools/toolbox";
import { AssistantTool, defineTool, toolSpec, ToolError } from "../src/assistant/tools/tool";
import { OwnerService } from "../src/owner/owner.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { SpeechToText } from "../src/voice/speech-to-text";

const tools: AssistantTool[] = [
  defineTool({
    name: "add_thing",
    progress: "Делаю add_thing…",
    description: "Records a thing right away",
    parameters: z.strictObject({ value: z.number() }),
    async run(context, args) {
      const recorded = `Записано: ${args.value} (${context.nextKey()})`;
      context.recorded.push(recorded);
      context.offer({
        kind: "undo",
        action: "undo_thing",
        payload: {},
        summary: recorded,
        label: "вещь",
      });
      return { recorded };
    },
  }),
  defineTool({
    name: "change_thing",
    progress: "Делаю change_thing…",
    description: "Changes a thing after a confirmation",
    parameters: z.strictObject({ value: z.number() }),
    async run(context, args) {
      const summary = `Изменить на ${args.value}?`;
      context.offer({ kind: "confirm", action: "change_thing", payload: {}, summary, label: "x" });
      return { status: "waiting_for_confirmation", summary };
    },
  }),
  defineTool({
    name: "refuse_thing",
    progress: "Делаю refuse_thing…",
    description: "Always refuses the arguments",
    parameters: z.strictObject({}),
    async run() {
      throw new ToolError("Плохие аргументы");
    },
  }),
  defineTool({
    name: "crash_thing",
    progress: "Делаю crash_thing…",
    description: "Breaks on our side",
    parameters: z.strictObject({}),
    async run() {
      throw new Error("Database is down");
    },
  }),
];

const call = (name: string, args: unknown = {}, callId = `call-${name}`): ModelAnswer => ({
  text: "",
  calls: [{ callId, name, arguments: JSON.stringify(args) }],
  sources: [],
});
const answer = (text: string): ModelAnswer => ({ text, calls: [], sources: [] });

/** Thinking lines are picked at random; tests compare them as one placeholder. */
const THINKING = "<thinking>";
const thinking = (progress: string[]) =>
  progress.map((text) => (THINKING_TEXTS.includes(text) ? THINKING : text));

/** The assistant with a scripted model and in-memory stand-ins for everything else. */
type Step = ModelAnswer | Error | ((request: ModelRequest) => ModelAnswer);

function setup(
  script: Step[] | (() => ModelAnswer),
  options: { turnsToday?: number; transcript?: string } = {},
) {
  const requests: ModelRequest[] = [];
  const saved: TurnItem[][] = [];
  const queue = Array.isArray(script) ? [...script] : [];

  const model: AssistantModel = {
    async respond(request) {
      requests.push(request);
      const next = Array.isArray(script) ? queue.shift()! : script();
      if (next instanceof Error) {
        throw next;
      }

      return typeof next === "function" ? next(request) : next;
    },
  };
  const speech: SpeechToText = { transcribe: async () => options.transcript ?? "" };
  const toolbox = {
    tools: {
      tools: new Map(tools.map((tool) => [tool.name, tool])),
      specs: tools.map(toolSpec),
      actions: new Map(),
    },
  };
  const history = {
    addNote: async () => undefined,
    recent: async () => [
      { type: "user", text: "раньше" },
      { type: "assistant", text: "ответ" },
    ],
    save: async (_owner: string, items: TurnItem[]) => {
      saved.push(items);
    },
    countSince: async () => options.turnsToday ?? 0,
  };
  const actions = {
    save: async (_owner: string, offers: object[]) =>
      offers.map((offer, index) => ({ ...offer, id: `id-${index}` })),
  };

  const service = new AssistantService(
    model,
    speech,
    {
      ensureOwner: async () => ({ id: "owner", timezone: "Asia/Tashkent" }),
    } as unknown as OwnerService,
    toolbox as unknown as AssistantToolbox,
    history as unknown as HistoryService,
    {
      list: async () => [{ id: "m1", text: "Такси — категория Транспорт" }],
    } as unknown as MemoryService,
    { get: async () => DEFAULT_SETTINGS } as unknown as AssistantSettingsService,
    actions as unknown as ActionsService,
  );

  return { service, requests, saved };
}

function message(overrides: Partial<ChatInput> = {}): ChatInput {
  return {
    telegramId: 1n,
    text: "запиши",
    audio: null,
    photo: null,
    key: "telegram-9",
    ...overrides,
  };
}

test("the model calls a tool, gets the result and answers; the turn is saved", async () => {
  const { service, requests, saved } = setup([call("add_thing", { value: 5 }), answer("Готово")]);

  const reply = await service.reply(message());

  assert.equal(reply.text, "Готово");
  assert.deepEqual(reply.buttons, [[{ text: "↩️ Отменить", data: "act:id-0" }]]);

  const [first, second] = requests;
  assert.equal(first.instructions, SYSTEM_PROMPT);
  assert.deepEqual(
    first.tools.map((spec) => spec.name),
    tools.map((tool) => tool.name),
  );
  assert.deepEqual(first.items.slice(0, 2), [
    { type: "user", text: "раньше" },
    { type: "assistant", text: "ответ" },
  ]);

  const note = first.items[2] as { type: string; text: string };
  assert.equal(note.type, "note");
  assert.match(
    note.text,
    /^Current local time: \d{4}-\d{2}-\d{2} \w+ \d{2}:\d{2} \(Asia\/Tashkent\)\./,
  );
  assert.match(note.text, /\[m1\] Такси — категория Транспорт/);
  assert.deepEqual(first.items[3], { type: "user", text: "запиши" });

  assert.deepEqual(second.items.slice(4), [
    { type: "call", callId: "call-add_thing", name: "add_thing", arguments: '{"value":5}' },
    {
      type: "result",
      callId: "call-add_thing",
      output: '{"recorded":"Записано: 5 (telegram-9-1)"}',
    },
  ]);

  // The note is rebuilt every turn, so the history keeps only the conversation itself.
  assert.deepEqual(
    saved[0].map((item) => item.type),
    ["user", "call", "result", "assistant"],
  );
});

test("a change waits for the button: the exact question goes under the answer", async () => {
  const single = setup([call("change_thing", { value: 7 }), answer("Подтвердите кнопкой")]);
  const one = await single.service.reply(message());

  assert.equal(one.text, "Подтвердите кнопкой\n\n❓ Изменить на 7?");
  assert.deepEqual(one.buttons, [
    [
      { text: "✅ Подтвердить", data: "act:id-0" },
      { text: "✖️ Отмена", data: "act-no:id-0" },
    ],
  ]);

  const double = setup([
    {
      text: "",
      calls: [
        { callId: "a", name: "change_thing", arguments: '{"value":1}' },
        { callId: "b", name: "change_thing", arguments: '{"value":2}' },
      ],
      sources: [],
    },
    answer("Подтвердите"),
  ]);
  const two = await double.service.reply(message());

  assert.equal(
    two.text,
    "Подтвердите\n\nЖдут подтверждения:\n1. Изменить на 1?\n2. Изменить на 2?",
  );
  assert.deepEqual(
    two.buttons.map((row) => row.map((button) => button.text)),
    [
      ["✅ 1", "✖️ 1"],
      ["✅ 2", "✖️ 2"],
    ],
  );
  // Parallel calls come back as all the calls and then all the results.
  assert.deepEqual(
    double.requests[1].items.slice(4).map((item) => item.type),
    ["call", "call", "result", "result"],
  );
});

test("mistakes in tool calls go back to the model as errors", async () => {
  const { service, requests } = setup([
    {
      text: "",
      calls: [
        { callId: "1", name: "refuse_thing", arguments: "{}" },
        { callId: "2", name: "no_such_tool", arguments: "{}" },
        { callId: "3", name: "add_thing", arguments: '{"value":"пять"}' },
        { callId: "4", name: "add_thing", arguments: "{oops" },
        { callId: "5", name: "crash_thing", arguments: "{}" },
      ],
      sources: [],
    },
    answer("Не вышло"),
  ]);

  const reply = await service.reply(message());
  const outputs = requests[1].items
    .filter((item) => item.type === "result")
    .map((item) => JSON.parse((item as { output: string }).output).error as string);

  assert.equal(reply.text, "Не вышло");
  assert.equal(outputs[0], "Плохие аргументы");
  assert.equal(outputs[1], "Нет инструмента no_such_tool");
  assert.match(outputs[2], /^Неверные аргументы/);
  assert.equal(outputs[3], "Аргументы должны быть JSON");
  assert.equal(outputs[4], "Внутренняя ошибка. Попробуйте позже");
});

test("if the model fails after a record, the record is reported instead of the answer", async () => {
  const failure = new AssistantModelError("Модель временно недоступна. Попробуйте ещё раз", 500);

  const afterRecord = setup([call("add_thing", { value: 3 }), failure]);
  const reply = await afterRecord.service.reply(message());

  assert.equal(reply.text, "Записано: 3 (telegram-9-1)");
  assert.equal(reply.buttons.length, 1);

  const beforeRecord = setup([failure]);
  await assert.rejects(beforeRecord.service.reply(message()), {
    name: "Error",
    message: "Модель временно недоступна. Попробуйте ещё раз",
  });
  await assert.rejects(setup([failure]).service.reply(message()), AssistantError);
});

test("a model that keeps calling tools is stopped", async () => {
  const { service, requests } = setup(() => call("refuse_thing"));

  const reply = await service.reply(message());

  assert.equal(requests.length, 8);
  assert.equal(reply.text, "Не получилось ответить. Попробуйте сформулировать иначе");
});

test("a voice message is transcribed first and marked as voice", async () => {
  const progress: string[] = [];
  const { service, requests } = setup([answer("Ок")], { transcript: "обед сорок пять тысяч" });

  await service.reply(
    message({
      text: "",
      audio: { data: Buffer.from("x"), filename: "voice.ogg" },
      onProgress: (text) => progress.push(text),
    }),
  );

  assert.deepEqual(thinking(progress), ["Распознаём голос…", THINKING]);
  assert.deepEqual(requests[0].items.at(-1), {
    type: "user",
    text: "[Голосовое сообщение] обед сорок пять тысяч",
  });

  const silence = setup([answer("Ок")], { transcript: "" });
  await assert.rejects(
    silence.service.reply(message({ audio: { data: Buffer.from("x"), filename: "voice.ogg" } })),
    /Не удалось разобрать речь/,
  );
  assert.equal(silence.requests.length, 0);
});

test("a photo goes to the model with the message", async () => {
  const { service, requests } = setup([answer("Ок")]);
  const photo = { full: Buffer.from([1, 2, 3]), thumbnail: Buffer.from([1]) };

  await service.reply(message({ text: "", photo }));

  assert.deepEqual(requests[0].items.at(-1), {
    type: "user",
    text: "(фото без подписи)",
    image: photo.full.toString("base64"),
  });
  assert.match((requests[0].items.at(-2) as { text: string }).text, /A photo is attached/);
});

test("the daily limit and a missing setup stop the assistant before the model", async () => {
  const limited = setup([answer("Ок")], { turnsToday: 200 });

  await assert.rejects(limited.service.reply(message()), /лимит/);
  assert.equal(limited.requests.length, 0);

  const service = new AssistantService(
    null,
    null,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );

  assert.equal(service.enabled, false);
  await assert.rejects(service.reply(message()), /не настроен/);
});

test("the history drops photos, cuts long results and starts after /new", async () => {
  const created: { items: TurnItem[] }[] = [];
  const queries: { where: { createdAt: { gte: Date } }; take: number }[] = [];
  const db = {
    assistantMessage: {
      create: async ({ data }: { data: { items: TurnItem[] } }) => {
        created.push(data);
      },
      findMany: async (query: { where: { createdAt: { gte: Date } }; take: number }) => {
        queries.push(query);
        return [
          { items: [{ type: "user", text: "второй" }] },
          { items: [{ type: "user", text: "первый" }] },
        ];
      },
      deleteMany: async () => undefined,
    },
  };
  const history = new HistoryService(db as unknown as PrismaService);

  await history.save("owner", [
    { type: "user", text: "что на фото?", image: "AAAA" },
    { type: "result", callId: "c", output: "x".repeat(5000) },
  ]);

  const [user, result] = created[0].items as [TurnItem, { output: string }];
  assert.deepEqual(user, { type: "user", text: "что на фото?" });
  assert.equal(result.output.length, 3000 + "… (обрезано)".length);

  const restartedAt = new Date(Date.now() - 60_000);
  const items = await history.recent("owner", restartedAt);

  assert.deepEqual(items, [
    { type: "user", text: "первый" },
    { type: "user", text: "второй" },
  ]);
  assert.equal(queries[0].where.createdAt.gte, restartedAt);
  assert.equal(queries[0].take, 10);
});

test("the chat sees what the assistant does and the answer as it is written", async () => {
  const progress: string[] = [];
  const written: string[] = [];
  const { service, requests } = setup([
    call("add_thing", { value: 1 }),
    (request) => {
      request.onText!("В октябре");
      request.onText!("В октябре 3 800 000 сум");
      return answer("В октябре 3 800 000 сум");
    },
  ]);
  const stop = new AbortController();

  await service.reply(
    message({
      signal: stop.signal,
      onProgress: (text) => progress.push(text),
      onText: (text) => written.push(text),
    }),
  );

  assert.deepEqual(thinking(progress), [THINKING, "Делаю add_thing…", THINKING]);
  assert.deepEqual(written, ["В октябре", "В октябре 3 800 000 сум"]);
  assert.equal(requests[0].signal, stop.signal);
});

test("a stopped answer keeps what was written and what was recorded", async () => {
  const stopped = setup([
    (request) => {
      request.onText!("В октябре потрачено");
      throw new AssistantStoppedError();
    },
  ]);
  const partial = await stopped.service.reply(message());

  assert.equal(partial.text, "В октябре потрачено\n\n⏹ Остановлено");
  assert.deepEqual(stopped.saved[0].at(-1), { type: "assistant", text: partial.text });

  const afterRecord = setup([call("add_thing", { value: 2 }), new AssistantStoppedError()]);
  const recorded = await afterRecord.service.reply(message());

  assert.equal(recorded.text, "Записано: 2 (telegram-9-1)\n\n⏹ Остановлено");
  assert.deepEqual(recorded.buttons, [[{ text: "↩️ Отменить", data: "act:id-0" }]]);
});

test("a tool called from outside the chat reports its records and questions to the chat", async () => {
  const { service, saved } = setup([]);

  const read = await service.callTool(1n, "refuse_thing", {}, "Home Assistant");
  assert.deepEqual(read, {
    output: '{"error":"Плохие аргументы"}',
    isError: true,
    notice: null,
  });

  const record = await service.callTool(1n, "add_thing", { value: 4 }, "Home Assistant");
  assert.equal(record.isError, false);
  assert.match(record.output, /"recorded":"Записано: 4 \(mcp-[0-9a-f-]{36}-1\)"/);
  assert.match(record.notice!.text, /^Через Home Assistant:\n• Записано: 4 \(mcp-/);
  assert.deepEqual(record.notice!.buttons, [[{ text: "↩️ Отменить", data: "act:id-0" }]]);

  const change = await service.callTool(1n, "change_thing", { value: 9 }, "Claude");
  assert.equal(change.notice!.text, "Через Claude:\n\n❓ Изменить на 9?");
  assert.equal(change.notice!.buttons[0][1].data, "act-no:id-0");

  // Nothing of it is a chat turn.
  assert.equal(saved.length, 0);
});

test("an answer from the web lists its sources, and the chat sees the search", async () => {
  const progress: string[] = [];
  const { service, requests } = setup([
    (request) => {
      request.onSearch!();
      return {
        text: "Корзинка на Чиланзаре работает до 23:00.",
        calls: [],
        sources: [
          { title: "Корзинка — магазины и часы работы", url: "https://korzinka.uz/stores" },
          { title: "", url: "https://yandex.uz/maps/org/korzinka" },
          { title: "Третий", url: "https://example.uz/3" },
          { title: "Четвёртый", url: "https://example.uz/4" },
        ],
      };
    },
  ]);

  const reply = await service.reply(
    message({ text: "до скольки работает корзинка?", onProgress: (text) => progress.push(text) }),
  );

  assert.equal(
    reply.text,
    [
      "Корзинка на Чиланзаре работает до 23:00.",
      "",
      "Источники:",
      "• Корзинка — магазины и часы работы: https://korzinka.uz/stores",
      "• yandex.uz: https://yandex.uz/maps/org/korzinka",
      "• Третий: https://example.uz/3",
    ].join("\n"),
  );
  assert.deepEqual(requests[0].webSearch, { timezone: "Asia/Tashkent" });
  assert.deepEqual(thinking(progress), [THINKING, "Ищу в интернете…"]);
});

import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DateTime } from "luxon";
import { buildTools, ToolboxDeps, Tools } from "../src/assistant/tools/toolbox";
import { Offer, ToolContext, ToolError } from "../src/assistant/tools/tool";

const TZ = "Asia/Tashkent";
const CARD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOLLARS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAFE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SALARY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ARCHIVED = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OPERATION = "11111111-1111-4111-8111-111111111111";
const TASK = "22222222-2222-4222-8222-222222222222";

/** yyyy-MM-dd for a day relative to today in Tashkent. */
function tashkentDay(offsetDays: number) {
  return DateTime.now().setZone(TZ).plus({ days: offsetDays }).toISODate()!;
}

type Call = { name: string; args: unknown[] };

/** Services with just enough behaviour for the tools; every call is recorded. */
function fakeServices() {
  const calls: Call[] = [];
  const track =
    <T>(name: string, result: (...args: never[]) => T) =>
    async (...args: unknown[]) => {
      calls.push({ name, args });
      return result(...(args as never[]));
    };

  const taskView = (input: Record<string, unknown>) => ({
    id: TASK,
    title: input.title,
    note: input.note ?? "",
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    repeat: input.repeat ?? "none",
    repeatDays: input.repeatDays ?? [],
    doneAt: null,
    snoozeAt: null,
    version: 1,
    createdAt: new Date().toISOString(),
  });

  const deps = {
    accounts: {
      list: track("accounts.list", () => [
        {
          id: CARD,
          name: "Карта",
          kind: "card",
          currency: "UZS",
          balance: "100.00",
          archived: false,
        },
        {
          id: DOLLARS,
          name: "Доллары",
          kind: "cash",
          currency: "USD",
          balance: "5.00",
          archived: false,
        },
      ]),
    },
    categories: {
      list: track("categories.list", () => [
        { id: CAFE, name: "Кафе", kind: "expense", archived: false, favorite: true },
        { id: SALARY, name: "Зарплата", kind: "income", archived: false, favorite: false },
        { id: ARCHIVED, name: "Старая", kind: "expense", archived: true, favorite: false },
      ]),
    },
    operations: {
      create: track("operations.create", (_owner: string, input: { occurredAt: string }) => ({
        id: OPERATION,
        version: 1,
        localDate: DateTime.fromISO(input.occurredAt).setZone(TZ).toISODate(),
      })),
      get: track("operations.get", () => ({
        id: OPERATION,
        kind: "expense",
        amount: "45000.00",
        currency: "UZS",
        category: { id: CAFE, name: "Кафе" },
        note: "обед",
        occurredAt: DateTime.now().setZone(TZ).minus({ days: 1 }).set({ hour: 13 }).toISO()!,
        localDate: tashkentDay(-1),
        version: 3,
        entries: [{ accountId: CARD, accountName: "Карта", currency: "UZS", amount: "-45000.00" }],
      })),
      list: track("operations.list", () => ({ items: [], count: 0, nextCursor: null })),
      totals: track("operations.totals", () => []),
      update: track("operations.update", () => ({})),
      remove: track("operations.remove", () => ({})),
    },
    tasks: {
      create: track("tasks.create", (_owner: string, input: Record<string, unknown>) =>
        taskView(input),
      ),
      list: track("tasks.list", () => [
        taskView({ title: "Позвонить в банк", dueDate: tashkentDay(1), dueTime: "10:00" }),
      ]),
    },
    workouts: {
      create: track("workouts.create", (_owner: string, input: Record<string, unknown>) => ({
        id: "workout-1",
        ...input,
      })),
    },
    weight: {
      list: track("weight.list", () => ({
        entries: [{ id: "w1", date: tashkentDay(0), weightKg: 81.9 }],
        current: 81.9,
        change7: null,
        change30: null,
      })),
      record: track("weight.record", () => ({ current: 82.4, change7: -0.6, change30: null })),
    },
    meals: {
      recordNow: track("meals.recordNow", () => ({
        id: "meal-1",
        items: [{ name: "Плов", grams: 300, kcal: 640, proteinG: 20, fatG: 25, carbsG: 80 }],
        totals: { kcal: 640, proteinG: 20, fatG: 25, carbsG: 80 },
        assumptions: [],
      })),
      day: track("meals.day", (_owner: string, date: string) => ({
        date,
        totals: { kcal: 1000, proteinG: 50, fatG: 40, carbsG: 100 },
        meals: [],
        workouts: [],
        burnedKcal: 0,
      })),
    },
    profile: {
      get: track("profile.get", () => ({
        targets: { kcal: 2100, proteinG: 120, fatG: 70, carbsG: 240 },
      })),
    },
    settings: {
      update: track("settings.update", (_owner: string, changes: Record<string, unknown>) => ({
        morningBriefAt: "08:00",
        weeklyReport: true,
        eveningBriefAt: "21:00",
        briefWeather: true,
        weatherPlace: null,
        ...changes,
      })),
    },
  };

  const tools = buildTools(deps as unknown as ToolboxDeps);
  const called = (name: string) => calls.filter((call) => call.name === name);

  return { tools, calls, called };
}

function toolContext(photo: ToolContext["photo"] = null) {
  const offers: Offer[] = [];
  let records = 0;

  const context: ToolContext = {
    ownerId: "owner",
    timezone: TZ,
    now: DateTime.now().setZone(TZ),
    photo,
    nextKey: () => `k-${++records}`,
    offer: (offer) => offers.push(offer),
    recorded: [],
  };

  return { context, offers };
}

/** Runs a tool the way the assistant does: the arguments go through its schema first. */
function run(tools: Tools, name: string, args: Record<string, unknown>, context: ToolContext) {
  const tool = tools.tools.get(name)!;

  return tool.run(context, tool.parameters.parse(args)) as Promise<Record<string, unknown>>;
}

const expense = {
  kind: "expense",
  amount: 45000,
  categoryId: CAFE,
  accountId: null,
  note: "обед",
  date: null,
  time: null,
};

test("every tool has a strict schema the model can follow", () => {
  const { tools } = fakeServices();
  const names = tools.specs.map((spec) => spec.name);

  assert.equal(new Set(names).size, names.length);

  for (const spec of tools.specs) {
    const schema = spec.parameters as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: boolean;
    };

    assert.match(spec.name, /^[a-z_]+$/);
    assert.ok(spec.description.length > 20, spec.name);
    assert.equal(schema.type, "object", spec.name);
    assert.equal(schema.additionalProperties, false, spec.name);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), spec.name);
    assert.equal("$schema" in schema, false);
  }
});

test("every button the tools offer has a handler", () => {
  const { tools } = fakeServices();

  assert.deepEqual([...tools.actions.keys()].sort(), [
    "delete_meal",
    "delete_operation",
    "delete_subscription",
    "delete_task",
    "delete_weight",
    "delete_workout",
    "set_budget",
    "undo_complete",
    "undo_meal",
    "undo_memory",
    "undo_operation",
    "undo_subscription",
    "undo_task",
    "undo_weight",
    "undo_workout",
    "update_operation",
    "update_subscription",
    "update_task",
  ]);
});

test("an expense goes to the main account in сум and can be undone", async () => {
  const { tools, called } = fakeServices();
  const { context, offers } = toolContext();

  const result = await run(tools, "add_operation", expense, context);

  assert.equal(result.recorded, "Расход 45 000 сум за обед записан · Кафе");
  assert.deepEqual(context.recorded, [result.recorded]);

  const [input, key] = called("operations.create")[0].args.slice(1) as [
    Record<string, unknown>,
    string,
  ];
  assert.equal(key, "k-1");
  assert.equal(input.kind, "expense");
  assert.equal(input.amount, "45000.00");
  assert.equal(input.accountId, CARD);
  assert.equal(input.categoryId, CAFE);
  assert.equal(input.note, "обед");

  assert.equal(offers.length, 1);
  assert.equal(offers[0].kind, "undo");
  assert.equal(offers[0].action, "undo_operation");
  assert.deepEqual(offers[0].payload, { id: OPERATION, version: 1 });
});

test("a past day without a time is recorded at midday and named in the answer", async () => {
  const { tools, called } = fakeServices();
  const { context } = toolContext();

  const result = await run(tools, "add_operation", { ...expense, date: tashkentDay(-1) }, context);

  const input = called("operations.create")[0].args[1] as { occurredAt: string };
  const local = DateTime.fromISO(input.occurredAt).setZone(TZ);
  assert.equal(local.toISODate(), tashkentDay(-1));
  assert.equal(local.hour, 12);
  assert.equal(result.recorded, "Расход 45 000 сум за обед записан · Кафе · вчера");
});

test("an expense on a dollar account is in dollars", async () => {
  const { tools } = fakeServices();
  const { context } = toolContext();

  const result = await run(
    tools,
    "add_operation",
    { ...expense, amount: 12.5, accountId: DOLLARS, note: "кофе" },
    context,
  );

  assert.equal(result.recorded, "Расход 12,50 $ за кофе записан · Кафе");
});

test("the model's mistakes come back as errors and nothing is recorded", async () => {
  const mistakes = [
    { categoryId: null },
    { categoryId: SALARY }, // an income category for an expense
    { categoryId: ARCHIVED },
    { amount: 0 },
    { accountId: "33333333-3333-4333-8333-333333333333" },
    { date: tashkentDay(1) },
    { time: "25:00" },
    { date: "завтра" },
  ];

  for (const mistake of mistakes) {
    const { tools, called } = fakeServices();
    const { context, offers } = toolContext();

    await assert.rejects(
      run(tools, "add_operation", { ...expense, ...mistake }, context),
      ToolError,
    );
    assert.equal(called("operations.create").length, 0, JSON.stringify(mistake));
    assert.equal(offers.length, 0);
  }
});

test("a workout is recorded with its calories, length and kind; an implausible one is not", async () => {
  const { tools, called } = fakeServices();
  const { context } = toolContext();
  const workout = { kcal: 420, minutes: 45, note: "бег", date: null, time: null };

  const result = await run(tools, "add_workout", workout, context);

  assert.equal(result.recorded, "Тренировка (бег): 420 ккал · 45 мин записана");
  const input = called("workouts.create")[0].args[1] as Record<string, unknown>;
  assert.equal(input.kcal, 420);
  assert.equal(input.durationMin, 45);

  await assert.rejects(run(tools, "add_workout", { ...workout, kcal: 90000 }, context), ToolError);
  assert.equal(called("workouts.create").length, 1);
});

const task = {
  title: "Позвонить в банк",
  note: "",
  dueDate: null,
  dueTime: null,
  repeat: "none",
  repeatDays: [],
};

test("a reminder, a note and a repeating task are confirmed in words", async () => {
  const { tools, called } = fakeServices();
  const { context, offers } = toolContext();

  const reminder = await run(
    tools,
    "add_task",
    { ...task, dueDate: tashkentDay(1), dueTime: "10:00" },
    context,
  );
  const note = await run(tools, "add_task", { ...task, title: "Купить молоко" }, context);
  const weekly = await run(
    tools,
    "add_task",
    {
      ...task,
      title: "Отчёт",
      dueDate: tashkentDay(3),
      dueTime: "09:00",
      repeat: "weekly",
      repeatDays: [1],
    },
    context,
  );

  assert.equal(reminder.recorded, "Напомню завтра в 10:00: Позвонить в банк");
  assert.equal(note.recorded, "Заметка записана: Купить молоко");
  assert.match(
    String(weekly.recorded),
    /^Буду напоминать каждый понедельник в 09:00: Отчёт\. Первый раз: /,
  );
  assert.deepEqual(
    called("tasks.create").map((call) => call.args[2]),
    ["k-1", "k-2", "k-3"],
  );
  assert.deepEqual(
    offers.map((offer) => offer.action),
    ["undo_task", "undo_task", "undo_task"],
  );
});

test("a reminder in the past or with a broken schedule is not created", async () => {
  const broken = [
    { dueDate: tashkentDay(-1), dueTime: "10:00" },
    { dueDate: "завтра" },
    { repeat: "daily" },
    { title: " " },
  ];

  for (const mistake of broken) {
    const { tools, called } = fakeServices();
    const { context } = toolContext();

    await assert.rejects(run(tools, "add_task", { ...task, ...mistake }, context), ToolError);
    assert.equal(called("tasks.create").length, 0, JSON.stringify(mistake));
  }
});

test("a new date for a task keeps its time and waits for confirmation", async () => {
  const { tools } = fakeServices();
  const { context, offers } = toolContext();
  const changes = {
    taskId: TASK,
    title: null,
    note: null,
    dueDate: tashkentDay(2),
    dueTime: null,
    repeat: null,
    repeatDays: null,
    clearTime: false,
    clearDate: false,
  };

  const result = await run(tools, "update_task", changes, context);

  assert.equal(result.status, "waiting_for_confirmation");
  assert.equal(offers[0].kind, "confirm");
  assert.equal(offers[0].action, "update_task");
  const input = (offers[0].payload as { input: Record<string, unknown> }).input;
  assert.equal(input.dueDate, tashkentDay(2));
  assert.equal(input.dueTime, "10:00");
  assert.equal(input.version, 1);
  assert.match(
    offers[0].summary,
    /^Изменить задачу «Позвонить в банк»: завтра в 10:00 → .+ в 10:00\?$/,
  );
});

test("a weigh-in is confirmed with the weekly change and can be put back", async () => {
  const { tools, called } = fakeServices();
  const { context, offers } = toolContext();

  const result = await run(tools, "record_weight", { kg: 82.4, date: null }, context);

  assert.equal(result.recorded, "Вес 82,4 кг записан · −0,6 кг за неделю");
  assert.deepEqual(called("weight.record")[0].args[1], { date: tashkentDay(0), weightKg: 82.4 });
  assert.deepEqual(offers[0].payload, { date: tashkentDay(0), previousKg: 81.9 });

  await assert.rejects(run(tools, "record_weight", { kg: 8, date: null }, context), ToolError);
  assert.equal(called("weight.record").length, 1);
});

test("a deletion only asks; the button handler deletes", async () => {
  const { tools, called } = fakeServices();
  const { context, offers } = toolContext();

  const result = await run(tools, "delete_operation", { operationId: OPERATION }, context);

  assert.equal(result.summary, "Удалить расход 45 000 сум · Кафе · вчера (обед)?");
  assert.equal(called("operations.remove").length, 0);

  const outcome = await tools.actions.get(offers[0].action)!("owner", offers[0].payload);

  assert.equal(outcome, "🗑 Удалено");
  assert.deepEqual(called("operations.remove")[0].args, ["owner", OPERATION, 3]);
});

test("a search passes the days and keeps the page small", async () => {
  const { tools, called } = fakeServices();
  const { context } = toolContext();

  await run(
    tools,
    "find_operations",
    {
      month: null,
      from: tashkentDay(-6),
      to: tashkentDay(0),
      kind: "expense",
      categoryId: CAFE,
      accountId: null,
      text: " такси ",
      limit: 500,
    },
    context,
  );

  const [owner, filter, limit] = called("operations.list")[0].args;
  assert.equal(owner, "owner");
  assert.deepEqual(filter, {
    month: undefined,
    from: tashkentDay(-6),
    to: tashkentDay(0),
    kind: "expense",
    categoryId: CAFE,
    accountId: undefined,
    q: "такси",
  });
  assert.equal(limit, 100);
  assert.deepEqual(called("operations.totals")[0].args[1], filter);
});

test("a meal is recognized and saved, with what is left of the day", async () => {
  const { tools, called } = fakeServices();
  const { context, offers } = toolContext();
  const meal = { description: "плов, примерно 300 г", usePhoto: false, date: null, time: null };

  const result = await run(tools, "log_meal", meal, context);

  assert.equal(result.recorded, "🍽 Записал: Плов 300 г — 640 ккал (Б 20 · Ж 25 · У 80)");
  assert.deepEqual((result.day as { left: { kcal: number } }).left.kcal, 1100);
  const [, input, key] = called("meals.recordNow")[0].args as [
    string,
    Record<string, unknown>,
    string,
  ];
  assert.equal(input.comment, "плов, примерно 300 г");
  assert.equal(input.upload, null);
  assert.equal(key, "k-1");
  assert.equal(offers[0].action, "undo_meal");

  await assert.rejects(
    run(tools, "log_meal", { ...meal, usePhoto: true }, context),
    /не приложено фото/,
  );
});

test("a photo of a meal is passed on with its thumbnail", async () => {
  const { tools, called } = fakeServices();
  const photo = { full: Buffer.from([1, 2]), thumbnail: Buffer.from([3]) };
  const { context } = toolContext(photo);

  await run(
    tools,
    "log_meal",
    { description: "", usePhoto: true, date: null, time: null },
    context,
  );

  const input = called("meals.recordNow")[0].args[1] as { upload: unknown };
  assert.deepEqual(input.upload, { photo: photo.full, thumbnail: photo.thumbnail });
});

test("the morning brief, its weather and the weekly report are changed by words", async () => {
  const { tools, called } = fakeServices();
  const { context } = toolContext();
  const keep = {
    morningBrief: null,
    eveningBrief: null,
    weeklyReport: null,
    briefWeather: null,
    weatherPlace: null,
  };

  await run(tools, "update_assistant_settings", { ...keep, morningBrief: "off" }, context);
  await run(
    tools,
    "update_assistant_settings",
    { ...keep, morningBrief: "07:30", eveningBrief: "off", weeklyReport: false },
    context,
  );
  const moved = await run(
    tools,
    "update_assistant_settings",
    { ...keep, weatherPlace: " Самарканд " },
    context,
  );

  assert.deepEqual(
    called("settings.update").map((call) => call.args[1]),
    [
      { morningBriefAt: null },
      { morningBriefAt: "07:30", eveningBriefAt: null, weeklyReport: false },
      { weatherPlace: "Самарканд" },
    ],
  );
  assert.equal(
    moved.recorded,
    "Утренняя сводка в 08:00, вечерняя в 21:00, погода в них: Самарканд, недельный отчёт включён",
  );

  await assert.rejects(
    run(tools, "update_assistant_settings", { ...keep, morningBrief: "7:30" }, context),
    ToolError,
  );
});

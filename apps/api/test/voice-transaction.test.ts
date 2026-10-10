import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DateTime } from "luxon";
import { OwnerService } from "../src/owner/owner.service";
import { AccountsService } from "../src/wallet/accounts/accounts.service";
import { CategoriesService } from "../src/wallet/categories/categories.service";
import { WorkoutsService } from "../src/nutrition/workouts/workouts.service";
import { OperationsService } from "../src/wallet/operations/operations.service";
import { TasksService } from "../src/tasks/tasks.service";
import { SpeechToText } from "../src/voice/speech-to-text";
import { ParsedTransaction, TransactionParser } from "../src/voice/transaction-parser";
import { VoiceError, VoiceTransactionService } from "../src/voice/voice-transaction.service";

const categories = [
  { id: "cafe", name: "Кафе", kind: "expense", archived: false },
  { id: "salary", name: "Зарплата", kind: "income", archived: false },
  { id: "old", name: "Старая", kind: "expense", archived: true },
];

function setup(text: string, parsed: Partial<ParsedTransaction>) {
  const created: { input: Record<string, unknown>; key: string }[] = [];
  const workouts: { input: Record<string, unknown>; key: string }[] = [];
  const tasks: { input: Record<string, unknown>; key: string }[] = [];
  const asked: unknown[] = [];
  const contexts: string[] = [];
  const speech: SpeechToText = { transcribe: async () => text };
  const parser: TransactionParser = {
    async parse(_text, choices, context) {
      asked.push(choices.map((choice) => choice.id));
      contexts.push(context.now);
      return {
        isTransaction: true,
        kind: "expense",
        amount: 45000,
        durationMinutes: null,
        categoryId: "cafe",
        note: "обед",
        title: "",
        dueDate: null,
        dueTime: null,
        repeat: "none",
        repeatDays: [],
        ...parsed,
      };
    },
  };
  const service = new VoiceTransactionService(
    speech,
    parser,
    {
      ensureOwner: async () => ({ id: "owner", timezone: "Asia/Tashkent" }),
    } as unknown as OwnerService,
    {
      list: async () => [{ id: "acc", archived: false, currency: "UZS" }],
    } as unknown as AccountsService,
    { list: async () => categories } as unknown as CategoriesService,
    {
      create: async (_owner: string, input: Record<string, unknown>, key: string) => {
        created.push({ input, key });
      },
    } as unknown as OperationsService,
    {
      create: async (_owner: string, input: Record<string, unknown>, key: string) => {
        workouts.push({ input, key });
      },
    } as unknown as WorkoutsService,
    {
      create: async (_owner: string, input: Record<string, unknown>, key: string) => {
        tasks.push({ input, key });
        return { ...input, repeatDays: input.repeatDays ?? [] };
      },
    } as unknown as TasksService,
  );
  return { service, created, workouts, tasks, asked, contexts };
}

const recording = { telegramId: 1n, audio: Buffer.from("x"), filename: "voice.ogg", key: "k1" };

test("an expense is written to the first active account and confirmed", async () => {
  const { service, created, asked } = setup("запиши расход 45000 сум за обед", {});
  const reply = await service.record(recording);

  assert.equal(reply.replace(/\s/g, " "), "Расход 45 000 сум за обед записан · Кафе");
  assert.deepEqual(asked, [["cafe", "salary"]]); // archived categories are not offered
  assert.equal(created[0].key, "k1");
  assert.equal(created[0].input.kind, "expense");
  assert.equal(created[0].input.amount, "45000.00");
  assert.equal(created[0].input.accountId, "acc");
  assert.equal(created[0].input.categoryId, "cafe");
  assert.equal(created[0].input.note, "обед");
});

test("an income is recognized", async () => {
  const { service, created } = setup("получил зарплату", {
    kind: "income",
    categoryId: "salary",
    note: "",
  });
  const reply = await service.record(recording);
  assert.match(reply, /^Доход .* записан · Зарплата$/);
  assert.equal(created[0].input.kind, "income");
});

test("notes that are not about money or have no valid category are rejected", async () => {
  for (const parsed of [
    { isTransaction: false },
    { amount: 0 },
    { categoryId: null },
    { categoryId: "salary" }, // an income category for an expense
  ]) {
    const { service, created } = setup("привет", parsed);
    await assert.rejects(service.record(recording), VoiceError);
    assert.equal(created.length, 0);
  }
});

test("without speech recognition configured nothing is recorded", async () => {
  const service = new VoiceTransactionService(
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
  await assert.rejects(service.record(recording), VoiceError);
});

test("a workout is recorded with its calories, length and kind", async () => {
  const { service, created, workouts } = setup(
    "запиши тренировку бег сорок пять минут сожжено 420",
    {
      kind: "workout",
      amount: 420,
      durationMinutes: 45,
      categoryId: null,
      note: "бег",
    },
  );
  const reply = await service.record(recording);

  assert.equal(reply.replace(/\s/g, " "), "Тренировка (бег): 420 ккал · 45 мин записана");
  assert.equal(created.length, 0); // no money operation
  assert.equal(workouts[0].key, "k1");
  assert.equal(workouts[0].input.kcal, 420);
  assert.equal(workouts[0].input.durationMin, 45);
  assert.equal(workouts[0].input.note, "бег");
});

test("an implausible workout is rejected", async () => {
  const { service, workouts } = setup("тренировка", {
    kind: "workout",
    amount: 90000,
    categoryId: null,
  });
  await assert.rejects(service.record(recording), VoiceError);
  assert.equal(workouts.length, 0);
});

/** yyyy-MM-dd for a day relative to today in Tashkent. */
function tashkentDay(offsetDays: number) {
  return DateTime.now().setZone("Asia/Tashkent").plus({ days: offsetDays }).toISODate()!;
}

test("a reminder becomes a task, and the parser gets the owner's local time", async () => {
  const { service, created, tasks, contexts } = setup("напомни завтра в 10 позвонить в банк", {
    kind: "task",
    amount: 0,
    categoryId: null,
    note: "",
    title: "Позвонить в банк",
    dueDate: tashkentDay(1),
    dueTime: "10:00",
  });
  const reply = await service.record(recording);

  assert.equal(reply, "Напомню завтра в 10:00: Позвонить в банк");
  assert.equal(created.length, 0);
  assert.equal(tasks[0].key, "k1");
  assert.equal(tasks[0].input.title, "Позвонить в банк");
  assert.equal(tasks[0].input.dueTime, "10:00");
  assert.match(contexts[0], /^\d{4}-\d{2}-\d{2} \w+ \d{2}:\d{2} \(Asia\/Tashkent\)$/);
});

test("a task without a date is a note, a repeating one is confirmed with its schedule", async () => {
  const note = setup("запиши заметку купить молоко", {
    kind: "task",
    amount: 0,
    title: "Купить молоко",
  });
  assert.equal(await note.service.record(recording), "Заметка записана: Купить молоко");

  const weekly = setup("каждый понедельник в 9 отчёт", {
    kind: "task",
    amount: 0,
    title: "Отчёт",
    dueDate: tashkentDay(3),
    dueTime: "09:00",
    repeat: "weekly",
    repeatDays: [1],
  });
  assert.match(
    await weekly.service.record(recording),
    /^Буду напоминать каждый понедельник в 09:00: Отчёт\. Первый раз: /,
  );
});

test("a one-off reminder for a time already past is rejected", async () => {
  const { service, tasks } = setup("напомни вчера", {
    kind: "task",
    amount: 0,
    title: "Позвонить",
    dueDate: tashkentDay(-1),
    dueTime: "10:00",
  });
  await assert.rejects(service.record(recording), /уже прошло/);
  assert.equal(tasks.length, 0);
});

test("a task without a title or with a broken date is rejected", async () => {
  for (const parsed of [
    { title: "" },
    { title: "Позвонить", dueDate: "завтра" },
    { title: "Отчёт", repeat: "daily" as const },
  ]) {
    const { service, tasks } = setup("напомни", { kind: "task", amount: 0, ...parsed });
    await assert.rejects(service.record(recording), VoiceError);
    assert.equal(tasks.length, 0);
  }
});

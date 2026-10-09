import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { OwnerService } from "../src/owner/owner.service";
import { AccountsService } from "../src/wallet/accounts/accounts.service";
import { CategoriesService } from "../src/wallet/categories/categories.service";
import { OperationsService } from "../src/wallet/operations/operations.service";
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
  const asked: unknown[] = [];
  const speech: SpeechToText = { transcribe: async () => text };
  const parser: TransactionParser = {
    async parse(_text, choices) {
      asked.push(choices.map((choice) => choice.id));
      return {
        isTransaction: true,
        kind: "expense",
        amount: 45000,
        categoryId: "cafe",
        note: "обед",
        ...parsed,
      };
    },
  };
  const service = new VoiceTransactionService(
    speech,
    parser,
    { ensureOwner: async () => ({ id: "owner" }) } as unknown as OwnerService,
    {
      list: async () => [{ id: "acc", archived: false, currency: "UZS" }],
    } as unknown as AccountsService,
    { list: async () => categories } as unknown as CategoriesService,
    {
      create: async (_owner: string, input: Record<string, unknown>, key: string) => {
        created.push({ input, key });
      },
    } as unknown as OperationsService,
  );
  return { service, created, asked };
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
  );
  assert.equal(service.enabled, false);
  await assert.rejects(service.record(recording), VoiceError);
});

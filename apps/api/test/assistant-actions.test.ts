import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException } from "@nestjs/common";
import { ActionsService } from "../src/assistant/actions.service";
import { HistoryService } from "../src/assistant/history.service";
import { AssistantToolbox } from "../src/assistant/tools/toolbox";
import { PrismaService } from "../src/prisma/prisma.service";

const ACTION = "33333333-3333-4333-8333-333333333333";

type Row = {
  id: string;
  ownerId: string;
  telegramId: bigint;
  kind: string;
  payload: Record<string, unknown>;
  summary: string;
  status: string;
  expiresAt: Date;
};

/** An in-memory PendingAction table and a handler that counts its runs. */
function setup(
  overrides: Partial<Row> = {},
  handler: (payload: Record<string, unknown>) => Promise<string> = async () => "🗑 Удалено",
) {
  const rows: Row[] = [
    {
      id: ACTION,
      ownerId: "owner",
      telegramId: 123n,
      kind: "delete_operation",
      payload: { id: "op" },
      summary: "Удалить расход 45 000 сум?",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    },
  ];
  const runs: Record<string, unknown>[] = [];
  const notes: string[] = [];

  const db = {
    pendingAction: {
      findFirst: async ({ where }: { where: { id: string; owner: { telegramId: bigint } } }) =>
        rows.find((row) => row.id === where.id && row.telegramId === where.owner.telegramId) ??
        null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status: string };
        data: { status: string };
      }) => {
        const matched = rows.filter((row) => row.id === where.id && row.status === where.status);
        matched.forEach((row) => (row.status = data.status));
        return { count: matched.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        rows.find((row) => row.id === where.id)!.status = data.status;
      },
    },
  };
  const toolbox = {
    tools: {
      actions: new Map([
        [
          "delete_operation",
          async (_owner: string, payload: Record<string, unknown>) => {
            runs.push(payload);
            return handler(payload);
          },
        ],
      ]),
    },
  };
  const history = {
    addNote: async (_owner: string, text: string) => {
      notes.push(text);
    },
  };

  const service = new ActionsService(
    db as unknown as PrismaService,
    toolbox as unknown as AssistantToolbox,
    history as unknown as HistoryService,
  );

  return { service, rows, runs, notes };
}

test("a confirmation runs once, and the model learns about it", async () => {
  const { service, rows, runs, notes } = setup();

  assert.equal(await service.resolve(123n, ACTION, true), "🗑 Удалено");
  assert.equal(await service.resolve(123n, ACTION, true), "Уже сделано");

  assert.deepEqual(runs, [{ id: "op" }]);
  assert.equal(rows[0].status, "done");
  assert.deepEqual(notes, ["Пользователь нажал кнопку: Удалить расход 45 000 сум? → 🗑 Удалено"]);
});

test("«Отмена» drops the action without running it", async () => {
  const { service, rows, runs, notes } = setup();

  assert.equal(await service.resolve(123n, ACTION, false), "✖️ Отменено");
  assert.equal(await service.resolve(123n, ACTION, true), "Уже отменено");

  assert.deepEqual(runs, []);
  assert.equal(rows[0].status, "cancelled");
  assert.deepEqual(notes, ["Пользователь нажал «Отмена»: Удалить расход 45 000 сум?"]);
});

test("an old button, someone else's button and an unknown one do nothing", async () => {
  const expired = setup({ expiresAt: new Date(Date.now() - 1000) });
  assert.equal(await expired.service.resolve(123n, ACTION, true), "Время вышло. Попросите ещё раз");
  assert.deepEqual(expired.runs, []);

  const foreign = setup();
  assert.equal(await foreign.service.resolve(999n, ACTION, true), "Это действие уже недоступно");
  assert.deepEqual(foreign.runs, []);

  const unknown = setup({ kind: "dropped_action" });
  assert.equal(await unknown.service.resolve(123n, ACTION, true), "Это действие уже недоступно");
  assert.equal(unknown.rows[0].status, "failed");
});

test("a refused change is reported; a failure on our side lets the tap be repeated", async () => {
  const refused = setup({}, async () => {
    throw new ConflictException("Операция уже изменена. Обновите историю");
  });
  assert.equal(
    await refused.service.resolve(123n, ACTION, true),
    "Не получилось: Операция уже изменена. Обновите историю",
  );
  assert.equal(refused.rows[0].status, "failed");

  const broken = setup({}, async () => {
    throw new Error("Database is down");
  });
  await assert.rejects(broken.service.resolve(123n, ACTION, true), /Database is down/);
  assert.equal(broken.rows[0].status, "pending");
});

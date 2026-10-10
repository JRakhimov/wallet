import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DateTime } from "luxon";
import { Task } from "@prisma/client";
import { AccessService } from "../src/access/access.service";
import { readConfig } from "../src/config/app-config";
import { PrismaService } from "../src/prisma/prisma.service";
import { dueLabel, repeatLabel } from "../src/tasks/labels";
import { advance, nextOccurrence, remindAtFor, Schedule } from "../src/tasks/recurrence";
import { plan } from "../src/tasks/tasks.service";
import { TaskReminderService, taskReminderText } from "../src/telegram/task-reminder.service";
import { TelegramBotService } from "../src/telegram/telegram-bot.service";

const ZONE = "Asia/Tashkent";

function schedule(overrides: Partial<Schedule>): Schedule {
  return {
    dueDate: "2026-10-10",
    dueTime: "09:00",
    repeat: "none",
    repeatDays: [],
    anchorDate: null,
    ...overrides,
  };
}

function tashkent(iso: string) {
  return DateTime.fromISO(iso, { zone: ZONE }).toJSDate();
}

test("next occurrence for every kind of repeat", () => {
  // 2026-10-09 is a Friday.
  assert.equal(nextOccurrence(schedule({ repeat: "none" }), "2026-10-09"), null);
  assert.equal(nextOccurrence(schedule({ repeat: "daily" }), "2026-10-09"), "2026-10-10");
  assert.equal(nextOccurrence(schedule({ repeat: "weekdays" }), "2026-10-09"), "2026-10-12");

  const weekly = schedule({ repeat: "weekly", repeatDays: [2, 4] });
  assert.equal(nextOccurrence(weekly, "2026-10-09"), "2026-10-13");
  assert.equal(nextOccurrence(weekly, "2026-10-13"), "2026-10-15");
});

test("monthly and yearly repeats keep the anchor day through short months", () => {
  const monthly = schedule({ repeat: "monthly", anchorDate: "2026-01-31" });
  assert.equal(nextOccurrence(monthly, "2026-01-31"), "2026-02-28");
  assert.equal(nextOccurrence(monthly, "2026-02-28"), "2026-03-31");
  assert.equal(nextOccurrence(monthly, "2026-03-31"), "2026-04-30");

  const yearly = schedule({ repeat: "yearly", anchorDate: "2028-02-29" });
  assert.equal(nextOccurrence(yearly, "2028-02-29"), "2029-02-28");
  assert.equal(nextOccurrence(yearly, "2031-02-28"), "2032-02-29");
});

test("the reminder moment is in the owner's timezone; a day without time is reminded at 9", () => {
  assert.equal(
    remindAtFor({ dueDate: "2026-10-11", dueTime: "10:00" }, ZONE)!.toISOString(),
    "2026-10-11T05:00:00.000Z",
  );
  assert.equal(
    remindAtFor({ dueDate: "2026-10-11", dueTime: null }, ZONE)!.toISOString(),
    "2026-10-11T04:00:00.000Z",
  );
  assert.equal(remindAtFor({ dueDate: null, dueTime: null }, ZONE), null);
});

test("a repeating task skips occurrences missed while the server was down", () => {
  const daily = schedule({ repeat: "daily", dueDate: "2026-10-05", dueTime: "09:00" });

  assert.deepEqual(advance(daily, tashkent("2026-10-10T08:00"), ZONE), {
    dueDate: "2026-10-10",
    remindAt: tashkent("2026-10-10T09:00"),
  });
  assert.equal(advance(daily, tashkent("2026-10-10T09:00"), ZONE)!.dueDate, "2026-10-11");
  assert.equal(advance(schedule({}), new Date(), ZONE), null);
});

test("a new task is not reminded about the past", () => {
  const now = tashkent("2026-10-10T12:00");

  assert.deepEqual(plan(schedule({ dueTime: "15:00" }), ZONE, now), {
    dueDate: "2026-10-10",
    remindAt: tashkent("2026-10-10T15:00"),
  });
  assert.deepEqual(plan(schedule({ dueTime: "10:00" }), ZONE, now), {
    dueDate: "2026-10-10",
    remindAt: null,
  });
  assert.equal(plan(schedule({ repeat: "daily" }), ZONE, now).dueDate, "2026-10-11");
  assert.deepEqual(plan(schedule({ dueDate: null, dueTime: null }), ZONE, now), {
    dueDate: null,
    remindAt: null,
  });
});

test("repeats and due dates are described in Russian", () => {
  const today = DateTime.fromISO("2026-10-10", { zone: ZONE });

  assert.equal(repeatLabel("weekdays", [], null), "по будням");
  assert.equal(repeatLabel("weekly", [3], null), "каждую среду");
  assert.equal(repeatLabel("weekly", [1, 3, 5], null), "по пн, ср, пт");
  assert.equal(repeatLabel("monthly", [], "2026-10-05"), "каждый месяц 5-го");
  assert.equal(repeatLabel("yearly", [], "2026-03-08"), "каждый год 8 марта");

  assert.equal(dueLabel("2026-10-10", "10:00", today), "сегодня в 10:00");
  assert.equal(dueLabel("2026-10-11", null, today), "завтра");
  assert.equal(dueLabel("2026-10-13", "09:00", today), "вт, 13 октября в 09:00");
  assert.equal(dueLabel("2027-01-04", null, today), "пн, 4 января 2027");
});

function task(overrides: Partial<Task>): Task {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerId: "owner",
    title: "Позвонить в банк",
    note: "",
    dueDate: "2026-10-10",
    dueTime: "10:00",
    repeat: "none",
    repeatDays: [],
    anchorDate: null,
    remindAt: tashkent("2026-10-10T10:00"),
    snoozeAt: null,
    doneAt: null,
    idempotencyKey: "k",
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

test("the reminder text has the title, the schedule and the note", () => {
  const text = taskReminderText(
    task({ repeat: "daily", anchorDate: "2026-10-10", note: "Номер в заметках" }),
    ZONE,
    false,
  );

  assert.match(text, /^🔔 Позвонить в банк\n/);
  assert.match(text, /каждый день/);
  assert.match(text, /\n\nНомер в заметках$/);
});

/** In-memory task table: updateMany honours the id and version filter like Postgres. */
function reminderFixture(tasks: Task[], failSend = false) {
  const sent: { text: string; buttons: unknown }[] = [];

  const db = {
    task: {
      findMany: async () =>
        tasks
          .filter((item) => item.remindAt || item.snoozeAt)
          .map((item) => ({ ...item, owner: { telegramId: 123n, timezone: ZONE } })),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; version: number };
        data: Partial<Task> & { version: { increment: number } };
      }) => {
        const item = tasks.find((row) => row.id === where.id && row.version === where.version);
        if (!item) {
          return { count: 0 };
        }

        Object.assign(item, { ...data, version: item.version + data.version.increment });

        return { count: 1 };
      },
    },
  };

  const bot = {
    async sendTo(_id: bigint, text: string, options: { buttons: unknown }) {
      if (failSend) {
        throw new Error("Telegram is down");
      }

      sent.push({ text, buttons: options.buttons });
    },
  };

  const access = { allowedIds: async () => [123n] };
  const config = readConfig({
    NODE_ENV: "production",
    APP_ORIGIN: "https://wallet.example",
    DATABASE_URL: "postgresql://localhost/wallet",
    BOT_TOKEN: "123:token",
    OWNER_TELEGRAM_ID: "123",
  });

  const service = new TaskReminderService(
    db as unknown as PrismaService,
    bot as unknown as TelegramBotService,
    config,
    access as unknown as AccessService,
  );

  return { service, sent };
}

test("a one-off reminder is sent once with buttons", async () => {
  const tasks = [task({})];
  const { service, sent } = reminderFixture(tasks);

  await service.tick(tashkent("2026-10-10T10:00"));
  await service.tick(tashkent("2026-10-10T10:01"));

  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Позвонить в банк/);
  assert.deepEqual(
    (sent[0].buttons as { callback_data: string }[][])[0].map((button) => button.callback_data),
    [`task:done:${tasks[0].id}`, `task:hour:${tasks[0].id}`, `task:tomorrow:${tasks[0].id}`],
  );
  assert.equal(tasks[0].remindAt, null);
  assert.equal(tasks[0].doneAt, null);
});

test("a repeating task moves on after its reminder; a snoozed one comes back once", async () => {
  const tasks = [
    task({ repeat: "daily", anchorDate: "2026-10-10" }),
    task({
      id: "22222222-2222-4222-8222-222222222222",
      remindAt: null,
      snoozeAt: tashkent("2026-10-10T10:00"),
    }),
  ];
  const { service, sent } = reminderFixture(tasks);

  await service.tick(tashkent("2026-10-10T10:00"));

  assert.equal(sent.length, 2);
  assert.equal(tasks[0].dueDate, "2026-10-11");
  assert.deepEqual(tasks[0].remindAt, tashkent("2026-10-11T10:00"));
  assert.equal(tasks[1].snoozeAt, null);
});

test("a reminder that could not be sent is tried again", async () => {
  const tasks = [task({ repeat: "daily", anchorDate: "2026-10-10" })];
  const { service, sent } = reminderFixture(tasks, true);

  await service.tick(tashkent("2026-10-10T10:00"));

  assert.equal(sent.length, 0);
  assert.equal(tasks[0].dueDate, "2026-10-10");
  assert.deepEqual(tasks[0].remindAt, tashkent("2026-10-10T10:00"));
});

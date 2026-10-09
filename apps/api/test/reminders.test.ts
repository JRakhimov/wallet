import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { readConfig } from "../src/config/app-config";
import { PrismaService } from "../src/prisma/prisma.service";
import { ReminderService } from "../src/telegram/reminder.service";
import { DayState, dueReminders, reminderFor } from "../src/telegram/reminders";
import { TelegramBotService } from "../src/telegram/telegram-bot.service";

const timezone = "Asia/Tashkent";
const at = (time: string) => DateTime.fromISO(`2026-10-14T${time}`, { zone: timezone });
const day = (changes: Partial<DayState> = {}): DayState => ({
  tracksMeals: true,
  mealsToday: 2,
  dinnerLogged: true,
  expensesToday: 5,
  ...changes,
});

test("a check is due from its time until the grace period ends", () => {
  assert.deepEqual(dueReminders(at("13:59")), []);
  assert.deepEqual(dueReminders(at("14:00")), ["lunch"]);
  assert.deepEqual(dueReminders(at("14:59")), ["lunch"]);
  assert.deepEqual(dueReminders(at("15:00")), []);
  assert.deepEqual(dueReminders(at("20:30")), ["evening"]);
});

test("14:00 reminds only when no meal was added today", () => {
  assert.match(reminderFor("lunch", day({ mealsToday: 0 }))!.text, /приём пищи/);
  assert.equal(reminderFor("lunch", day({ mealsToday: 1 })), null);
  assert.equal(reminderFor("lunch", day({ mealsToday: 0, tracksMeals: false })), null);
});

test("20:00 has a different message for dinner only, expenses only and both", () => {
  const dinnerOnly = reminderFor("evening", day({ dinnerLogged: false }))!;
  const expensesOnly = reminderFor("evening", day({ expensesToday: 1 }))!;
  const both = reminderFor("evening", day({ dinnerLogged: false, expensesToday: 0 }))!;

  assert.equal(dinnerOnly.text, "🍽 Уже 20:00, а ужин не записан. Не забыли отметить приём пищи?");
  assert.deepEqual(dinnerOnly.apps, ["nutrition"]);
  assert.equal(
    expensesOnly.text,
    "💳 За сегодня внесено только один расход. Не забыли записать все траты за день?",
  );
  assert.deepEqual(expensesOnly.apps, ["wallet"]);
  assert.match(both.text, /Ужин не записан, а за день внесено ни одного расхода/);
  assert.deepEqual(both.apps, ["nutrition", "wallet"]);
  assert.equal(new Set([dinnerOnly.text, expensesOnly.text, both.text]).size, 3);

  assert.equal(reminderFor("evening", day()), null);
  assert.equal(reminderFor("evening", day({ expensesToday: 2 })), null);
});

test("without the nutrition app only expenses are checked", () => {
  const reminder = reminderFor(
    "evening",
    day({ tracksMeals: false, dinnerLogged: false, expensesToday: 0 }),
  )!;
  assert.deepEqual(reminder.apps, ["wallet"]);
});

const config = readConfig({
  NODE_ENV: "production",
  AUTH_MODE: "telegram",
  APP_ORIGIN: "https://wallet.example",
  DATABASE_URL: "postgresql://localhost/wallet",
  BOT_TOKEN: "123:token",
  OWNER_TELEGRAM_ID: "123",
});

function fixture(counts: { meals: number; dinners: number; expenses: number }) {
  const claimed = new Set<string>();
  const sent: { text: string; silent: boolean }[] = [];
  let failSend = false;
  const db = {
    owner: {
      findUnique: async () => ({ id: "owner", timezone, nutritionProfile: { ownerId: "owner" } }),
    },
    meal: {
      count: async ({ where }: { where: { eatenAt: { gte: Date } } }) =>
        // The day query starts at midnight, the dinner query at 16:00.
        where.eatenAt.gte.getTime() === at("00:00").toMillis() ? counts.meals : counts.dinners,
    },
    operation: { count: async () => counts.expenses },
    reminder: {
      create: async ({ data }: { data: { kind: string; date: string } }) => {
        const key = `${data.kind}/${data.date}`;
        if (claimed.has(key)) {
          throw new Prisma.PrismaClientKnownRequestError("Duplicate", {
            code: "P2002",
            clientVersion: "6.19.0",
          });
        }
        claimed.add(key);
      },
      update: async () => undefined,
      delete: async ({ where }: { where: { kind_date: { kind: string; date: string } } }) => {
        claimed.delete(`${where.kind_date.kind}/${where.kind_date.date}`);
      },
    },
  };
  const bot = {
    sendToOwner: async (text: string, options: { silent: boolean }) => {
      if (failSend) throw new Error("down");
      sent.push({ text, silent: options.silent });
    },
  };
  const service = new ReminderService(
    db as unknown as PrismaService,
    bot as unknown as TelegramBotService,
    config,
  );
  return { service, sent, failSend: (value: boolean) => (failSend = value) };
}

test("a reminder is sent with sound once per day", async () => {
  const { service, sent } = fixture({ meals: 0, dinners: 0, expenses: 5 });
  await service.tick(at("14:01"));
  await service.tick(at("14:02"));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].silent, false);
});

test("nothing is sent when the day is in order, and the check is not repeated", async () => {
  const { service, sent } = fixture({ meals: 2, dinners: 1, expenses: 4 });
  await service.tick(at("14:01"));
  await service.tick(at("20:01"));
  assert.deepEqual(sent, []);
});

test("a failed send is retried on the next tick", async () => {
  const { service, sent, failSend } = fixture({ meals: 0, dinners: 0, expenses: 5 });
  failSend(true);
  await service.tick(at("14:01"));
  assert.equal(sent.length, 0);
  failSend(false);
  await service.tick(at("14:02"));
  assert.equal(sent.length, 1);
});

test("a missed reminder is not sent hours late", async () => {
  const { service, sent } = fixture({ meals: 0, dinners: 0, expenses: 5 });
  await service.tick(at("17:00"));
  assert.equal(sent.length, 0);
});

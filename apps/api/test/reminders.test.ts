import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { readConfig } from "../src/config/app-config";
import { AccessService } from "../src/access/access.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { ReminderService } from "../src/telegram/reminder.service";
import { chargeDayIn, isChargedOn, nextChargeDate } from "../src/wallet/subscriptions/charge-date";
import { DayState, dueReminders, reminderFor } from "../src/telegram/reminders";
import { TelegramBotService } from "../src/telegram/telegram-bot.service";

const timezone = "Asia/Tashkent";
const at = (time: string) => DateTime.fromISO(`2026-10-14T${time}`, { zone: timezone });
const day = (changes: Partial<DayState> = {}): DayState => ({
  tracksMeals: true,
  mealsToday: 2,
  dinnerLogged: true,
  expensesToday: 5,
  subscriptionsToday: [],
  subscriptionsTomorrow: [],
  ...changes,
});

test("a check is due from its time until the grace period ends", () => {
  assert.deepEqual(dueReminders(at("13:59")), []);
  assert.deepEqual(dueReminders(at("14:00")), ["lunch"]);
  assert.deepEqual(dueReminders(at("14:59")), ["lunch"]);
  assert.deepEqual(dueReminders(at("15:00")), []);
  assert.deepEqual(dueReminders(at("20:30")), ["evening"]);
  assert.deepEqual(dueReminders(at("08:00")), ["subscription_morning"]);
  assert.deepEqual(dueReminders(at("18:30")), ["subscription_eve"]);
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

type StoredSubscription = { name: string; amount: Prisma.Decimal; chargeDay: number };

function fixture(
  counts: { meals: number; dinners: number; expenses: number },
  subscriptions: StoredSubscription[] = [],
) {
  const claimed = new Set<string>();
  const sent: { text: string; silent: boolean }[] = [];
  let failSend = false;
  const db = {
    owner: {
      findMany: async () => [
        { id: "owner", telegramId: 123n, timezone, nutritionProfile: { ownerId: "owner" } },
      ],
    },
    meal: {
      count: async ({ where }: { where: { eatenAt: { gte: Date } } }) =>
        // The day query starts at midnight, the dinner query at 16:00.
        where.eatenAt.gte.getTime() === at("00:00").toMillis() ? counts.meals : counts.dinners,
    },
    operation: { count: async () => counts.expenses },
    subscription: { findMany: async () => subscriptions },
    reminder: {
      create: async ({ data }: { data: { ownerId: string; kind: string; date: string } }) => {
        const key = `${data.ownerId}/${data.kind}/${data.date}`;
        if (claimed.has(key)) {
          throw new Prisma.PrismaClientKnownRequestError("Duplicate", {
            code: "P2002",
            clientVersion: "6.19.0",
          });
        }
        claimed.add(key);
      },
      update: async () => undefined,
      delete: async ({
        where,
      }: {
        where: { ownerId_kind_date: { ownerId: string; kind: string; date: string } };
      }) => {
        const { ownerId, kind, date } = where.ownerId_kind_date;
        claimed.delete(`${ownerId}/${kind}/${date}`);
      },
    },
  };
  const bot = {
    sendTo: async (_telegramId: bigint, text: string, options: { silent: boolean }) => {
      if (failSend) throw new Error("down");
      sent.push({ text, silent: options.silent });
    },
  };
  const service = new ReminderService(
    db as unknown as PrismaService,
    bot as unknown as TelegramBotService,
    config,
    { allowedIds: async () => [123n] } as unknown as AccessService,
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

test("a subscription reminder lists what is charged and the total", () => {
  const due = [
    { name: "Netflix", amount: "50000.00" },
    { name: "Музыка", amount: "29900.50" },
  ];

  const eve = reminderFor("subscription_eve", day({ subscriptionsTomorrow: due }))!;
  const morning = reminderFor("subscription_morning", day({ subscriptionsToday: due }))!;

  assert.equal(
    eve.text,
    "📅 Завтра спишутся подписки:\n• Netflix: 50 000 сум\n• Музыка: 29 900,50 сум\nИтого: 79 900,50 сум",
  );
  assert.match(morning.text, /^☀️ Сегодня спишутся подписки:/);
  assert.deepEqual(eve.apps, ["wallet"]);
});

test("a single subscription has no total, and no charges mean no reminder", () => {
  const single = reminderFor(
    "subscription_eve",
    day({ subscriptionsTomorrow: [{ name: "Netflix", amount: "50000.00" }] }),
  )!;

  assert.equal(single.text, "📅 Завтра спишутся подписки:\n• Netflix: 50 000 сум");
  assert.equal(reminderFor("subscription_eve", day()), null);
  assert.equal(reminderFor("subscription_morning", day()), null);
});

test("a charge day missing from a short month moves to the last day", () => {
  const february = DateTime.fromISO("2026-02-10", { zone: timezone });
  const april = DateTime.fromISO("2026-04-30", { zone: timezone });

  assert.equal(chargeDayIn(31, february), 28);
  assert.equal(isChargedOn(31, april), true);
  assert.equal(isChargedOn(30, april), true);
  assert.equal(isChargedOn(15, april), false);
});

test("the next charge date counts today and rolls over to the next month", () => {
  const octoberFifteenth = DateTime.fromISO("2026-10-15T09:00", { zone: timezone });

  assert.equal(nextChargeDate(15, octoberFifteenth).toISODate(), "2026-10-15");
  assert.equal(nextChargeDate(14, octoberFifteenth).toISODate(), "2026-11-14");
  assert.equal(nextChargeDate(31, octoberFifteenth).toISODate(), "2026-10-31");
  assert.equal(
    nextChargeDate(31, DateTime.fromISO("2026-11-05", { zone: timezone })).toISODate(),
    "2026-11-30",
  );
  assert.equal(
    nextChargeDate(1, DateTime.fromISO("2026-12-20", { zone: timezone })).toISODate(),
    "2027-01-01",
  );
});

test("subscription reminders go out the day before and on the day, once each", async () => {
  const subscription = { name: "Netflix", amount: new Prisma.Decimal("50000"), chargeDay: 15 };
  const { service, sent } = fixture({ meals: 2, dinners: 1, expenses: 4 }, [subscription]);

  await service.tick(at("08:01"));
  assert.equal(sent.length, 0);

  await service.tick(at("18:01"));
  await service.tick(at("18:02"));
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /^📅 Завтра/);

  const dayOf = DateTime.fromISO("2026-10-15T08:01", { zone: timezone });
  await service.tick(dayOf);
  assert.equal(sent.length, 2);
  assert.match(sent[1].text, /^☀️ Сегодня/);
});

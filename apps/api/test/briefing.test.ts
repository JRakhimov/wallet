import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DateTime } from "luxon";
import { eveningText, morningText, weeklyText } from "../src/assistant/briefing";
import { DEFAULT_SETTINGS, weatherPlaceOf } from "../src/assistant/settings.service";
import { TaskView } from "../src/tasks/tasks.service";
import { dueBriefings } from "../src/telegram/briefing.service";

const TZ = "Asia/Tashkent";
const monday = DateTime.fromISO("2026-10-12T08:00", { zone: TZ });
const sunday = DateTime.fromISO("2026-10-18T20:05", { zone: TZ });

function task(title: string, dueTime: string | null = null): TaskView {
  return {
    id: title,
    title,
    note: "",
    dueDate: "2026-10-12",
    dueTime,
    repeat: "none",
    repeatDays: [],
    doneAt: null,
    snoozeAt: null,
    version: 1,
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

test("the morning brief lists the day's tasks, the budget per day, charges, calories and weight", () => {
  const text = morningText({
    now: monday,
    weather: {
      place: "Ташкент",
      icon: "🌧",
      sky: "небольшой дождь",
      min: 11.4,
      max: 21.6,
      precipitationChance: 60,
    },
    overdue: [task("Оплатить интернет")],
    today: [task("Позвонить в банк", "10:00"), task("Купить продукты")],
    month: { spent: "1200000.00", budget: "5000000.00", remaining: "3800000.00" },
    charges: [{ name: "Netflix", amount: "120000.00" }],
    targetKcal: 2100,
    weight: { current: 82.4, change7: -0.6 },
  });

  assert.equal(
    text,
    [
      "☀️ Доброе утро! Сегодня понедельник, 12 октября.",
      "🌧 Ташкент: +11…+22°, небольшой дождь, осадки 60%.",
      "",
      "📝 Задачи на сегодня:",
      "• 10:00 Позвонить в банк",
      "• Купить продукты",
      "⚠️ Просрочено: 1 («Оплатить интернет»)",
      "",
      "💳 Бюджет на октябрь: осталось 3 800 000 из 5 000 000 сум, примерно 190 000 сум в день.",
      "📅 Сегодня спишутся подписки: Netflix 120 000 сум.",
      "",
      "🥗 Норма на сегодня: 2 100 ккал.",
      "⚖️ Вес: 82,4 кг (−0,6 кг за неделю).",
    ].join("\n"),
  );
});

test("without a budget or a profile the brief says what is there", () => {
  const text = morningText({
    now: monday,
    weather: null,
    overdue: [],
    today: [],
    month: { spent: "1200000.00", budget: null, remaining: null },
    charges: [],
    targetKcal: null,
    weight: { current: null, change7: null },
  });

  assert.equal(
    text,
    [
      "☀️ Доброе утро! Сегодня понедельник, 12 октября.",
      "",
      "📝 На сегодня задач нет.",
      "",
      "💳 Потрачено за октябрь: 1 200 000 сум.",
    ].join("\n"),
  );
});

test("the weekly report compares the week with the one before", () => {
  const text = weeklyText({
    from: sunday.minus({ days: 6 }).startOf("day"),
    to: sunday.startOf("day"),
    spent: "1450000.00",
    spentBefore: "1650000.00",
    topCategories: [
      { name: "Продукты", value: "520000.00" },
      { name: "Кафе", value: "310000.00" },
    ],
    nutrition: { averageKcal: 2050, daysLogged: 6, targetKcal: 2100 },
    workouts: { count: 3, kcal: 1260 },
    weight: { current: 82.4, change: -0.6 },
    tasks: { done: 9, overdue: 1 },
  });

  assert.equal(
    text,
    [
      "📊 Итоги недели (12 октября – 18 октября)",
      "",
      "💳 Потрачено: 1 450 000 сум (на 12% меньше, чем неделей раньше)",
      "Больше всего: Продукты 520 000, Кафе 310 000",
      "🥗 В среднем 2 050 ккал в день при норме 2 100 (записано дней: 6 из 7)",
      "🏃 Дней с тренировками: 3, сожжено 1 260 ккал",
      "⚖️ Вес: 82,4 кг (−0,6 кг за неделю).",
      "📝 Задач выполнено: 9, просрочено: 1",
    ].join("\n"),
  );
});

test("the brief goes out at the chosen time, the report on Sunday evening, and both can be off", () => {
  const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ });

  assert.deepEqual(dueBriefings(at("2026-10-12T08:00"), DEFAULT_SETTINGS), ["morning_brief"]);
  assert.deepEqual(dueBriefings(at("2026-10-12T08:59"), DEFAULT_SETTINGS), ["morning_brief"]);
  assert.deepEqual(dueBriefings(at("2026-10-12T09:00"), DEFAULT_SETTINGS), []);
  assert.deepEqual(dueBriefings(at("2026-10-12T07:59"), DEFAULT_SETTINGS), []);
  assert.deepEqual(dueBriefings(at("2026-10-12T20:10"), DEFAULT_SETTINGS), []);
  assert.deepEqual(dueBriefings(at("2026-10-12T21:00"), DEFAULT_SETTINGS), ["evening_brief"]);
  assert.deepEqual(dueBriefings(sunday, DEFAULT_SETTINGS), ["weekly_report"]);

  const early = { ...DEFAULT_SETTINGS, morningBriefAt: "07:30" };
  assert.deepEqual(dueBriefings(at("2026-10-12T07:30"), early), ["morning_brief"]);

  const off = {
    ...DEFAULT_SETTINGS,
    morningBriefAt: null,
    eveningBriefAt: null,
    weeklyReport: false,
  };
  assert.deepEqual(dueBriefings(at("2026-10-12T08:00"), off), []);
  assert.deepEqual(dueBriefings(at("2026-10-12T21:00"), off), []);
  assert.deepEqual(dueBriefings(sunday, off), []);
});

test("frost and a dry day read naturally in the brief", () => {
  const text = morningText({
    now: monday,
    weather: {
      place: "Москва",
      icon: "❄️",
      sky: "снег",
      min: -3.6,
      max: 0.2,
      precipitationChance: 10,
    },
    overdue: [],
    today: [],
    month: { spent: "0.00", budget: null, remaining: null },
    charges: [],
    targetKcal: null,
    weight: { current: null, change7: null },
  });

  assert.match(
    text,
    /^☀️ Доброе утро! Сегодня понедельник, 12 октября\.\n❄️ Москва: −4…0°, снег\.\n/,
  );
});

test("the brief's weather is for the chosen city, or the city of the timezone", () => {
  assert.equal(weatherPlaceOf(DEFAULT_SETTINGS, "Asia/Tashkent"), "Tashkent");
  assert.equal(weatherPlaceOf(DEFAULT_SETTINGS, "Asia/Ho_Chi_Minh"), "Ho Chi Minh");
  assert.equal(
    weatherPlaceOf({ ...DEFAULT_SETTINGS, weatherPlace: "Самарканд" }, "Asia/Tashkent"),
    "Самарканд",
  );
});

const evening = DateTime.fromISO("2026-10-12T21:00", { zone: TZ });

function tomorrowTask(title: string, dueTime: string | null = null) {
  return { ...task(title, dueTime), dueDate: "2026-10-13" };
}

test("the evening brief sums up the day and shows tomorrow", () => {
  const text = eveningText({
    now: evening,
    weather: {
      place: "Ташкент",
      icon: "⛅",
      sky: "переменная облачность",
      min: 9.6,
      max: 19.4,
      precipitationChance: 10,
    },
    spentToday: "185000.00",
    month: { budget: "5000000.00", remaining: "3615000.00" },
    eaten: { kcal: 1850.4, targetKcal: 2100 },
    unfinished: [
      task("Купить продукты"),
      task("Оплатить интернет"),
      task("Позвонить маме"),
      task("Полить цветы"),
    ],
    tomorrow: [tomorrowTask("Позвонить в банк", "10:00"), tomorrowTask("Забрать посылку")],
    charges: [{ name: "Netflix", amount: "120000.00" }],
  });

  assert.equal(
    text,
    [
      "🌙 Итоги дня, понедельник, 12 октября",
      "",
      "💳 Сегодня потрачено 185 000 сум, от бюджета на октябрь осталось 3 615 000 сум.",
      "🥗 Съедено 1 850 ккал из 2 100.",
      "📝 Не выполнено сегодня: «Купить продукты», «Оплатить интернет», «Позвонить маме» и ещё 1.",
      "",
      "Завтра:",
      "⛅ Ташкент: +10…+19°, переменная облачность.",
      "📝 Задачи:",
      "• 10:00 Позвонить в банк",
      "• Забрать посылку",
      "📅 Спишутся подписки: Netflix 120 000 сум.",
    ].join("\n"),
  );
});

test("a quiet evening without a budget, profile or plans", () => {
  const text = eveningText({
    now: evening,
    weather: null,
    spentToday: "0.00",
    month: { budget: null, remaining: null },
    eaten: null,
    unfinished: [],
    tomorrow: [],
    charges: [],
  });

  assert.equal(
    text,
    [
      "🌙 Итоги дня, понедельник, 12 октября",
      "",
      "💳 Сегодня расходов не было.",
      "",
      "Завтра:",
      "📝 Задач на завтра нет.",
    ].join("\n"),
  );
});

test("an overspent budget and an empty diary are said plainly", () => {
  const text = eveningText({
    now: evening,
    weather: null,
    spentToday: "300000.00",
    month: { budget: "5000000.00", remaining: "-120000.00" },
    eaten: { kcal: 0, targetKcal: 2100 },
    unfinished: [],
    tomorrow: [],
    charges: [],
  });

  assert.match(
    text,
    /💳 Сегодня потрачено 300 000 сум, бюджет на октябрь превышен на 120 000 сум\./,
  );
  assert.match(text, /🥗 Еда сегодня не записана\./);
});

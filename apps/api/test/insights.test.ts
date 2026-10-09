import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { computeInsights, InsightRow } from "../src/wallet/reports/insights";

const timezone = "Asia/Tashkent";
const cafe = { id: "cafe", name: "Кафе", icon: "coffee" };
const taxi = { id: "taxi", name: "Транспорт", icon: "car" };

function row(
  date: string,
  amount: number,
  note: string,
  category = cafe,
  kind: InsightRow["kind"] = "expense",
): InsightRow {
  return {
    occurredAt: DateTime.fromISO(`${date}T12:00`, { zone: timezone }).toJSDate(),
    kind,
    amount: new Prisma.Decimal(amount),
    note,
    category,
  };
}

const rows = [
  row("2026-10-01", 100, "Обед"),
  row("2026-10-03", 300, "такси", taxi), // Saturday
  row("2026-10-04", 200, "обед"), // Sunday
  row("2026-10-05", 50, ""),
  row("2026-10-12", 450, "ужин"),
  row("2026-10-13", 150, "обед"),
  row("2026-10-13", 50, "обед", cafe, "refund"),
  row("2026-10-14", 100, "кофе"),
  row("2026-09-02", 500, "обед"),
  row("2026-09-10", 100, "такси", taxi),
];

// Wednesday, 14 October.
const now = DateTime.fromISO("2026-10-14T18:00", { zone: timezone });
const insights = (month = "2026-10", budget: number | null = 2000) =>
  computeInsights({
    rows,
    month,
    timezone,
    now,
    budget: budget === null ? null : new Prisma.Decimal(budget),
  });

test("the last three days are compared with the usual day of the 30 before them", () => {
  const { recent } = insights();
  assert.deepEqual(
    recent.days.map((day) => [day.date, day.value]),
    [
      ["2026-10-14", "100.00"],
      ["2026-10-13", "100.00"], // the refund is subtracted
      ["2026-10-12", "450.00"],
    ],
  );
  assert.equal(recent.average, "21.67"); // 650 over 30 days
  assert.equal(recent.days[0].changePercent, 362);
});

test("weeks start on Monday, are cut at the month's edges and at today", () => {
  const { weeks } = insights();
  assert.deepEqual(
    weeks.map((week) => [week.start, week.end, week.days, week.value, week.count]),
    [
      ["2026-10-01", "2026-10-04", 4, "600.00", 3],
      ["2026-10-05", "2026-10-11", 7, "50.00", 1],
      ["2026-10-12", "2026-10-18", 3, "650.00", 3],
    ],
  );
  assert.deepEqual(
    weeks.map((week) => [week.current, week.peak]),
    [
      [false, false],
      [false, false],
      [true, true],
    ],
  );
});

test("weekends are compared with working days per day", () => {
  const { weekday, weekend } = insights().weekdays;
  assert.deepEqual([weekend.total, weekend.days, weekend.perDay], ["500.00", 4, "125.00"]);
  assert.equal(weekend.topCategory?.name, "Транспорт");
  assert.deepEqual([weekday.total, weekday.days, weekday.perDay], ["800.00", 10, "80.00"]);
  assert.equal(weekday.topCategory?.name, "Кафе");
});

test("a month in progress is compared with the same days of the previous month", () => {
  const { previous } = insights().trends;
  assert.equal(previous.month, "2026-09");
  assert.equal(previous.comparedDays, 14);
  assert.equal(previous.total, "1300.00");
  assert.equal(previous.previousTotal, "600.00");
  assert.equal(previous.changePercent, 117);
  assert.deepEqual(
    previous.categories.map((category) => [category.id, category.previous]),
    [
      ["cafe", "500.00"],
      ["taxi", "100.00"],
    ],
  );
});

test("forecast follows the pace so far and checks it against the budget", () => {
  const { forecast } = insights().trends;
  assert.equal(forecast?.projected, "2878.57"); // 1300 over 14 days, for 31 days
  assert.equal(forecast?.exceedsBudget, true);
  assert.equal(insights("2026-10", null).trends.forecast?.exceedsBudget, null);
  assert.equal(insights("2026-09").trends.forecast, null);
});

test("history lists six months, oldest first", () => {
  const { history } = insights().trends;
  assert.deepEqual(
    history.map((item) => item.month),
    ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
  );
  assert.deepEqual(
    history.slice(-2).map((item) => item.value),
    ["600.00", "1300.00"],
  );
});

test("facts: biggest purchase, busiest day, average purchase and frequent notes", () => {
  const { facts } = insights();
  assert.equal(facts.count, 7);
  assert.equal(facts.averageCheck, "192.86");
  assert.equal(facts.biggest?.amount, "450.00");
  assert.equal(facts.busiestDay?.date, "2026-10-12");
  // "Обед" and "обед" merge; both notes total 450, so their order is not fixed.
  const notes = Object.fromEntries(facts.topNotes.map((item) => [item.note, item]));
  assert.deepEqual(notes["обед"], { note: "обед", count: 3, total: "450.00" });
  assert.deepEqual(notes["ужин"], { note: "ужин", count: 1, total: "450.00" });
});

test("an empty month gives empty insights", () => {
  const empty = computeInsights({ rows: [], month: "2026-10", timezone, now, budget: null });
  assert.equal(empty.facts.count, 0);
  assert.equal(empty.facts.biggest, null);
  assert.equal(empty.trends.previous.changePercent, null);
  assert.deepEqual(
    empty.recent.days.map((day) => day.changePercent),
    [null, null, null],
  );
});

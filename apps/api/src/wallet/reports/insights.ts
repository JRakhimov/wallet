import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";

/** An expense or a refund; refunds count as negative spending. */
export type InsightRow = {
  occurredAt: Date;
  kind: "expense" | "refund";
  amount: Prisma.Decimal;
  note: string;
  category: { id: string; name: string; icon: string };
};

type Money = Prisma.Decimal;
type CategoryTotal = { id: string; name: string; icon: string; value: Money };

const RECENT_DAYS = 3;
const BASELINE_DAYS = 30;
const HISTORY_MONTHS = 6;
const TOP_CATEGORIES = 5;
const TOP_NOTES = 5;
/** Earlier in the month the pace is too noisy to project. */
const MIN_FORECAST_DAYS = 3;
const FIRST_WEEKEND_DAY = 6;

const zero = () => new Prisma.Decimal(0);
const signed = (row: InsightRow) => (row.kind === "refund" ? row.amount.negated() : row.amount);
const sum = (values: Iterable<Money>) => [...values].reduce((total, v) => total.plus(v), zero());
const fixed = (value: Money) => value.toFixed(2);

/** Whole percent change from `previous` to `current`; null when there is nothing to compare. */
function percentChange(current: Money, previous: Money) {
  if (previous.lte(0)) {
    return null;
  }
  return current.minus(previous).div(previous).times(100).round().toNumber();
}

/** The period of operations the insights of a month need: six months and the last 33 days. */
export function insightsRange(month: string, timezone: string, now: DateTime) {
  const monthStart = DateTime.fromISO(`${month}-01`, { zone: timezone }).startOf("day");
  const recentStart = now
    .setZone(timezone)
    .startOf("day")
    .minus({ days: RECENT_DAYS + BASELINE_DAYS - 1 });
  const from = DateTime.min(monthStart.minus({ months: HISTORY_MONTHS - 1 }), recentStart);
  const to = DateTime.max(monthStart.plus({ months: 1 }), now);
  return { gte: from.toJSDate(), lt: to.toJSDate() };
}

/**
 * Spending patterns of a month: the last days, weeks, weekdays against weekends, trends and
 * a few notable facts. Pure: everything comes in as arguments, so it is easy to test.
 */
export function computeInsights(input: {
  rows: InsightRow[];
  month: string;
  timezone: string;
  now: DateTime;
  budget: Money | null;
}) {
  const { rows, month, timezone, budget } = input;
  const today = input.now.setZone(timezone).startOf("day");
  const monthStart = DateTime.fromISO(`${month}-01`, { zone: timezone }).startOf("day");
  const monthEnd = monthStart.plus({ months: 1 });
  const daysInMonth = monthEnd.diff(monthStart, "days").days;
  const elapsed = Math.min(
    daysInMonth,
    Math.max(0, Math.floor(today.diff(monthStart, "days").days) + 1),
  );
  const isCurrent = today >= monthStart && today < monthEnd;
  const isComplete = today >= monthEnd;

  const dated = rows.map((row) => ({
    row,
    day: DateTime.fromJSDate(row.occurredAt).setZone(timezone).startOf("day"),
  }));
  const spentOn = new Map<string, Money>();
  const expensesOn = new Map<string, number>();
  for (const { row, day } of dated) {
    const key = day.toISODate()!;
    spentOn.set(key, (spentOn.get(key) ?? zero()).plus(signed(row)));
    if (row.kind === "expense") {
      expensesOn.set(key, (expensesOn.get(key) ?? 0) + 1);
    }
  }
  const spent = (day: DateTime) => spentOn.get(day.toISODate()!) ?? zero();
  const spentBetween = (from: DateTime, to: DateTime) => {
    let total = zero();
    for (let day = from; day < to; day = day.plus({ days: 1 })) {
      total = total.plus(spent(day));
    }
    return total;
  };
  const inMonth = dated.filter(({ day }) => day >= monthStart && day < monthEnd);

  return {
    month,
    today: today.toISODate()!,
    recent: recentDays(today, spent, spentBetween),
    weeks: weeks({ monthStart, monthEnd, today, spent, expensesOn }),
    weekdays: weekdaysVersusWeekends({ monthStart, monthEnd, today, spent, inMonth }),
    trends: {
      previous: previousMonth({ dated, monthStart, monthEnd, elapsed, isComplete }),
      forecast: forecast({
        isCurrent,
        elapsed,
        daysInMonth,
        budget,
        total: spentBetween(monthStart, monthEnd),
      }),
      history: history(monthStart, spentBetween),
    },
    facts: facts(inMonth, monthStart, monthEnd, spent),
  };
}

/** Today and the two days before, each against the usual day of the 30 days before them. */
function recentDays(
  today: DateTime,
  spent: (day: DateTime) => Money,
  spentBetween: (from: DateTime, to: DateTime) => Money,
) {
  const baselineEnd = today.minus({ days: RECENT_DAYS - 1 });
  const average = spentBetween(baselineEnd.minus({ days: BASELINE_DAYS }), baselineEnd).div(
    BASELINE_DAYS,
  );
  const days = Array.from({ length: RECENT_DAYS }, (_, index) => {
    const day = today.minus({ days: index });
    const value = spent(day);
    return {
      date: day.toISODate()!,
      value: fixed(value),
      changePercent: percentChange(value, average),
    };
  });
  return { average: fixed(average), days };
}

/** Monday-first weeks that overlap the month, cut at the month's edges and at today. */
function weeks(input: {
  monthStart: DateTime;
  monthEnd: DateTime;
  today: DateTime;
  spent: (day: DateTime) => Money;
  expensesOn: Map<string, number>;
}) {
  const { monthStart, monthEnd, today, spent, expensesOn } = input;
  const result: {
    start: string;
    end: string;
    days: number;
    value: Money;
    count: number;
    current: boolean;
  }[] = [];

  for (
    let weekStart = monthStart.startOf("week");
    weekStart < monthEnd;
    weekStart = weekStart.plus({ weeks: 1 })
  ) {
    const from = DateTime.max(weekStart, monthStart);
    const to = DateTime.min(weekStart.plus({ weeks: 1 }), monthEnd);
    const counted = DateTime.min(to, today.plus({ days: 1 }));
    const days = Math.max(0, Math.round(counted.diff(from, "days").days));
    if (days === 0) {
      continue;
    }
    let value = zero();
    let count = 0;
    for (let day = from; day < counted; day = day.plus({ days: 1 })) {
      value = value.plus(spent(day));
      count += expensesOn.get(day.toISODate()!) ?? 0;
    }
    result.push({
      start: from.toISODate()!,
      end: to.minus({ days: 1 }).toISODate()!,
      days,
      value,
      count,
      current: today >= from && today < to,
    });
  }

  const peak = result.reduce<Money>((max, week) => (week.value.gt(max) ? week.value : max), zero());
  return result.map((week) => ({
    ...week,
    value: fixed(week.value),
    peak: peak.gt(0) && week.value.eq(peak),
  }));
}

function topCategory(totals: Map<string, CategoryTotal>) {
  const [top] = [...totals.values()].sort((a, b) => b.value.comparedTo(a.value));
  return top && top.value.gt(0)
    ? { name: top.name, icon: top.icon, value: fixed(top.value) }
    : null;
}

/** Totals and the daily average of working days against weekends, with each group's top category. */
function weekdaysVersusWeekends(input: {
  monthStart: DateTime;
  monthEnd: DateTime;
  today: DateTime;
  spent: (day: DateTime) => Money;
  inMonth: { row: InsightRow; day: DateTime }[];
}) {
  const { monthStart, monthEnd, today, spent, inMonth } = input;
  const isWeekend = (day: DateTime) => day.weekday >= FIRST_WEEKEND_DAY;
  const groups = {
    weekday: { total: zero(), days: 0, categories: new Map<string, CategoryTotal>() },
    weekend: { total: zero(), days: 0, categories: new Map<string, CategoryTotal>() },
  };

  const last = DateTime.min(monthEnd, today.plus({ days: 1 }));
  for (let day = monthStart; day < last; day = day.plus({ days: 1 })) {
    const group = groups[isWeekend(day) ? "weekend" : "weekday"];
    group.days += 1;
    group.total = group.total.plus(spent(day));
  }
  for (const { row, day } of inMonth) {
    const { categories } = groups[isWeekend(day) ? "weekend" : "weekday"];
    const entry = categories.get(row.category.id) ?? { ...row.category, value: zero() };
    entry.value = entry.value.plus(signed(row));
    categories.set(row.category.id, entry);
  }

  const view = (group: (typeof groups)["weekday"]) => ({
    total: fixed(group.total),
    days: group.days,
    perDay: fixed(group.days ? group.total.div(group.days) : zero()),
    topCategory: topCategory(group.categories),
  });
  return { weekday: view(groups.weekday), weekend: view(groups.weekend) };
}

/**
 * Spending against the month before, in total and per category. A month in progress is
 * compared with the same number of days of the previous one, not with all of it.
 */
function previousMonth(input: {
  dated: { row: InsightRow; day: DateTime }[];
  monthStart: DateTime;
  monthEnd: DateTime;
  elapsed: number;
  isComplete: boolean;
}) {
  const { dated, monthStart, monthEnd, elapsed, isComplete } = input;
  const previousStart = monthStart.minus({ months: 1 });
  const previousDays = monthStart.diff(previousStart, "days").days;
  const currentEnd = isComplete ? monthEnd : monthStart.plus({ days: elapsed });
  const previousEnd = isComplete
    ? monthStart
    : previousStart.plus({ days: Math.min(elapsed, previousDays) });

  const totals = (from: DateTime, to: DateTime) => {
    const byCategory = new Map<string, CategoryTotal>();
    for (const { row, day } of dated) {
      if (day >= from && day < to) {
        const entry = byCategory.get(row.category.id) ?? { ...row.category, value: zero() };
        entry.value = entry.value.plus(signed(row));
        byCategory.set(row.category.id, entry);
      }
    }
    return byCategory;
  };
  const current = totals(monthStart, currentEnd);
  const previous = totals(previousStart, previousEnd);
  const currentTotal = sum([...current.values()].map((entry) => entry.value));
  const previousTotal = sum([...previous.values()].map((entry) => entry.value));

  const categories = [...current.values()]
    .sort((a, b) => b.value.comparedTo(a.value))
    .slice(0, TOP_CATEGORIES)
    .map((entry) => {
      const before = previous.get(entry.id)?.value ?? zero();
      return {
        id: entry.id,
        name: entry.name,
        icon: entry.icon,
        value: fixed(entry.value),
        previous: fixed(before),
        changePercent: percentChange(entry.value, before),
      };
    });

  return {
    month: previousStart.toFormat("yyyy-MM"),
    /** How many days of each month are compared. */
    comparedDays: Math.round(currentEnd.diff(monthStart, "days").days),
    total: fixed(currentTotal),
    previousTotal: fixed(previousTotal),
    changePercent: percentChange(currentTotal, previousTotal),
    categories,
  };
}

/** Where the current month ends up at the pace so far; null for other months or too early. */
function forecast(input: {
  isCurrent: boolean;
  elapsed: number;
  daysInMonth: number;
  budget: Money | null;
  total: Money;
}) {
  const { isCurrent, elapsed, daysInMonth, budget, total } = input;
  if (!isCurrent || elapsed < MIN_FORECAST_DAYS) {
    return null;
  }
  const perDay = total.div(elapsed);
  const projected = perDay.times(daysInMonth);
  return {
    perDay: fixed(perDay),
    projected: fixed(projected),
    budget: budget ? fixed(budget) : null,
    exceedsBudget: budget ? projected.gt(budget) : null,
  };
}

/** Spending of the selected month and the five before it, oldest first. */
function history(monthStart: DateTime, spentBetween: (from: DateTime, to: DateTime) => Money) {
  return Array.from({ length: HISTORY_MONTHS }, (_, index) => {
    const start = monthStart.minus({ months: HISTORY_MONTHS - 1 - index });
    return {
      month: start.toFormat("yyyy-MM"),
      value: fixed(spentBetween(start, start.plus({ months: 1 }))),
    };
  });
}

/** The biggest purchase, the busiest day, the average purchase and what is bought most often. */
function facts(
  inMonth: { row: InsightRow; day: DateTime }[],
  monthStart: DateTime,
  monthEnd: DateTime,
  spent: (day: DateTime) => Money,
) {
  const expenses = inMonth.filter(({ row }) => row.kind === "expense");
  const biggest = expenses.reduce<(typeof expenses)[number] | null>(
    (max, item) => (!max || item.row.amount.gt(max.row.amount) ? item : max),
    null,
  );

  let busiest: { date: string; value: Money } | null = null;
  for (let day = monthStart; day < monthEnd; day = day.plus({ days: 1 })) {
    const value = spent(day);
    if (value.gt(0) && (!busiest || value.gt(busiest.value))) {
      busiest = { date: day.toISODate()!, value };
    }
  }

  const notes = new Map<string, { note: string; count: number; total: Money }>();
  for (const { row } of expenses) {
    const key = row.note.trim().toLowerCase();
    if (key) {
      const entry = notes.get(key) ?? { note: key, count: 0, total: zero() };
      entry.count += 1;
      entry.total = entry.total.plus(row.amount);
      notes.set(key, entry);
    }
  }

  const spentTotal = sum(expenses.map(({ row }) => row.amount));
  return {
    count: expenses.length,
    averageCheck: expenses.length ? fixed(spentTotal.div(expenses.length)) : null,
    biggest: biggest && {
      amount: fixed(biggest.row.amount),
      note: biggest.row.note,
      category: biggest.row.category.name,
      date: biggest.day.toISODate()!,
    },
    busiestDay: busiest && { date: busiest.date, value: fixed(busiest.value) },
    topNotes: [...notes.values()]
      .sort((a, b) => b.total.comparedTo(a.total))
      .slice(0, TOP_NOTES)
      .map((entry) => ({ note: entry.note, count: entry.count, total: fixed(entry.total) })),
  };
}

export type Insights = ReturnType<typeof computeInsights>;

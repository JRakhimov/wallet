import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { request } from "@ui/lib/api-client";
import { money } from "@ui/lib/format";
import { Insights, Subscription } from "../api";
import { CategoryIcon } from "../components/CategoryIcon";
import { monthlyTotal } from "../lib/subscriptions";

const RECENT_LABELS = ["Сегодня", "Вчера", "Позавчера"];

const ruDate = (date: string, format: string) =>
  DateTime.fromISO(date).setLocale("ru").toFormat(format);

/** "+12%" / "−5%": for spending, more is worse, so the sign carries the colour. */
function Change({ percent, suffix = "" }: { percent: number | null; suffix?: string }) {
  if (percent === null) {
    return <span className="change flat">—</span>;
  }
  const sign = percent > 0 ? "+" : percent < 0 ? "−" : "";
  const tone = percent > 0 ? "up" : percent < 0 ? "down" : "flat";
  return (
    <span className={`change ${tone}`}>
      {sign}
      {Math.abs(percent)}%{suffix}
    </span>
  );
}

const share = (value: string, max: number) =>
  `${Math.min(100, Math.max(0, (Number(value) / Math.max(max, 1)) * 100))}%`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h2 className="section-title">{title}</h2>
      {children}
    </>
  );
}

/** Spending patterns of the selected month: recent days, weeks, weekdays, trends, facts. */
export function InsightsView({ month }: { month: string }) {
  const insightsQ = useQuery({
    queryKey: ["insights", month],
    queryFn: () => request<Insights>("/reports/insights?month=" + month),
  });
  const insights = insightsQ.data;

  if (!insights) {
    return (
      <div className="empty">
        {insightsQ.error ? "Не удалось загрузить динамику" : "Считаем динамику…"}
      </div>
    );
  }
  return (
    <>
      <RecentDays recent={insights.recent} />
      <Weeks weeks={insights.weeks} />
      <Weekdays weekdays={insights.weekdays} />
      <Trends trends={insights.trends} />
      <SubscriptionsCost />
      <Facts facts={insights.facts} />
    </>
  );
}

/** What the monthly subscriptions cost in total; hidden when there are none. */
function SubscriptionsCost() {
  const subscriptionsQ = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => request<Subscription[]>("/subscriptions"),
  });
  const subscriptions = subscriptionsQ.data ?? [];

  if (subscriptions.length === 0) {
    return null;
  }

  return (
    <Section title="Подписки">
      <div className="card insight-card">
        <div className="insight-row">
          <span className="insight-label">В месяц</span>
          <strong>{money(monthlyTotal(subscriptions))} сум</strong>
        </div>
        <p className="insight-note">
          {subscriptions.length} {subscriptionsWord(subscriptions.length)}, списываются каждый месяц
        </p>
      </div>
    </Section>
  );
}

/** "подписка" / "подписки" / "подписок" for a count. */
function subscriptionsWord(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return "подписок";
  }
  if (last === 1) {
    return "подписка";
  }

  return last >= 2 && last <= 4 ? "подписки" : "подписок";
}

function RecentDays({ recent }: { recent: Insights["recent"] }) {
  return (
    <Section title="Последние 3 дня">
      <div className="card insight-card">
        {recent.days.map((day, index) => (
          <div key={day.date} className="insight-row">
            <span className="insight-label">{RECENT_LABELS[index]}</span>
            <strong>{money(day.value)} сум</strong>
            <Change percent={day.changePercent} />
          </div>
        ))}
        <p className="insight-note">
          Обычный день: {money(recent.average)} сум, среднее за 30 дней до этого
        </p>
      </div>
    </Section>
  );
}

function Weeks({ weeks }: { weeks: Insights["weeks"] }) {
  if (!weeks.length) {
    return null;
  }
  const max = Math.max(...weeks.map((week) => Number(week.value)), 1);
  return (
    <Section title="По неделям">
      <div className="card insight-card">
        {weeks.map((week) => (
          <div key={week.start} className="week-row">
            <div className="stat-line">
              <span>
                {ruDate(week.start, "d")}–{ruDate(week.end, "d LLL")}
                {week.current && <small className="insight-tag">идёт</small>}
                {week.peak && <small className="insight-tag peak">больше всего</small>}
              </span>
              <strong>{money(week.value)} сум</strong>
            </div>
            <span className="progress">
              <i className={week.peak ? "peak" : ""} style={{ width: share(week.value, max) }} />
            </span>
            <small className="insight-note">
              {week.days} дн · {week.count} трат
            </small>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Weekdays({ weekdays }: { weekdays: Insights["weekdays"] }) {
  const groups = [
    { key: "weekday", title: "Будни", group: weekdays.weekday },
    { key: "weekend", title: "Выходные", group: weekdays.weekend },
  ] as const;
  const busier =
    Number(weekdays.weekend.perDay) > Number(weekdays.weekday.perDay) ? "weekend" : "weekday";
  const hasSpending = Number(weekdays.weekday.total) + Number(weekdays.weekend.total) > 0;

  return (
    <Section title="Будни и выходные">
      <div className="weekday-grid">
        {groups.map(({ key, title, group }) => (
          <div
            key={key}
            className={"card weekday-card" + (hasSpending && busier === key ? " busier" : "")}
          >
            <span className="insight-label">{title}</span>
            <strong>
              {money(group.perDay)} <small>сум в день</small>
            </strong>
            <small className="insight-note">
              Всего {money(group.total)} сум за {group.days} дн
            </small>
            {group.topCategory && (
              <span className="weekday-top">
                <CategoryIcon name={group.topCategory.icon} size={16} />
                {group.topCategory.name}
              </span>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function Trends({ trends }: { trends: Insights["trends"] }) {
  const { previous, forecast, history } = trends;
  const maxHistory = Math.max(...history.map((item) => Number(item.value)), 1);
  const previousName = ruDate(previous.month + "-01", "LLLL");

  return (
    <Section title="Тенденции">
      <div className="card insight-card">
        <div className="insight-row">
          <span className="insight-label">
            К прошлому месяцу
            <small className="insight-note">
              За {previous.comparedDays} дн · {previousName}
            </small>
          </span>
          <strong>{money(previous.total)} сум</strong>
          <Change percent={previous.changePercent} />
        </div>
        {previous.categories.map((category) => (
          <div key={category.id} className="insight-row compact">
            <span className="insight-label">
              <CategoryIcon name={category.icon} size={16} /> {category.name}
            </span>
            <span>{money(category.value)} сум</span>
            <Change percent={category.changePercent} />
          </div>
        ))}
      </div>

      {forecast && (
        <div className="card insight-card">
          <span className="insight-label">Прогноз на конец месяца</span>
          <strong className="forecast-value">{money(forecast.projected)} сум</strong>
          <p className="insight-note">При текущем темпе {money(forecast.perDay)} сум в день</p>
          {forecast.budget && (
            <p className={"forecast-budget " + (forecast.exceedsBudget ? "over" : "ok")}>
              {forecast.exceedsBudget
                ? `Выйдете за бюджет ${money(forecast.budget)} сум на ${money(Number(forecast.projected) - Number(forecast.budget))} сум`
                : `Укладываетесь в бюджет ${money(forecast.budget)} сум`}
            </p>
          )}
        </div>
      )}

      <div className="card insight-card">
        <span className="insight-label">Последние 6 месяцев</span>
        <div className="history-chart">
          {history.map((item, index) => (
            <div key={item.month} className="history-col">
              <small>{money(Number(item.value) / 1000)}k</small>
              <div className="history-track">
                <i
                  className={index === history.length - 1 ? "current" : ""}
                  style={{ height: share(item.value, maxHistory) }}
                />
              </div>
              <small>{ruDate(item.month + "-01", "LLL")}</small>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Facts({ facts }: { facts: Insights["facts"] }) {
  if (!facts.count) {
    return null;
  }
  return (
    <Section title="Интересное">
      <div className="card insight-card">
        {facts.biggest && (
          <div className="insight-row">
            <span className="insight-label">
              Самая крупная трата
              <small className="insight-note">
                {[facts.biggest.note, facts.biggest.category].filter(Boolean)[0]} ·{" "}
                {ruDate(facts.biggest.date, "d LLL")}
              </small>
            </span>
            <strong>{money(facts.biggest.amount)} сум</strong>
          </div>
        )}
        {facts.busiestDay && (
          <div className="insight-row">
            <span className="insight-label">
              Самый затратный день
              <small className="insight-note">
                {ruDate(facts.busiestDay.date, "d LLLL, cccc")}
              </small>
            </span>
            <strong>{money(facts.busiestDay.value)} сум</strong>
          </div>
        )}
        <div className="insight-row">
          <span className="insight-label">
            Средний чек
            <small className="insight-note">{facts.count} трат за месяц</small>
          </span>
          <strong>{facts.averageCheck ? money(facts.averageCheck) : "—"} сум</strong>
        </div>
      </div>

      {facts.topNotes.length > 0 && (
        <div className="card insight-card">
          <span className="insight-label">На что уходит больше всего</span>
          {facts.topNotes.map((item) => (
            <div key={item.note} className="insight-row compact">
              <span className="insight-label">
                {item.note} <small className="insight-note">× {item.count}</small>
              </span>
              <strong>{money(item.total)} сум</strong>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

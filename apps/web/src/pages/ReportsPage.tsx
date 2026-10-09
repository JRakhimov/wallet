import { DateTime } from "luxon";
import { Summary } from "../api";
import { CategoryIcon } from "../components/CategoryIcon";
import { MonthSwitch } from "@ui/components/MonthSwitch";
import { currentMonth, money, monthLabel } from "@ui/lib/format";

export function ReportsPage({
  month,
  setMonth,
  summary,
  onCategory,
}: {
  month: string;
  setMonth: (month: string) => void;
  summary: Summary;
  onCategory: (id: string) => void;
}) {
  const net = Number(summary.netExpense || 0);
  const maxDay = Math.max(...summary.days.map((d) => Number(d.value)), 1);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Отчёты</h1>
        </div>
      </div>
      <MonthSwitch month={month} setMonth={setMonth} futureDisabled={month === currentMonth()} />
      <div className="report-hero">
        <span>Расходы за {monthLabel(month)}</span>
        <strong>
          {money(net)} <small>сум</small>
        </strong>
        <div className="report-sub">
          <span>Доходы {money(summary.income)} сум</span>
          <span>Возвраты {money(summary.refunds)} сум</span>
        </div>
      </div>
      <h2 className="section-title">По категориям</h2>
      {summary.categories.length ? (
        summary.categories.map((c) => (
          <button key={c.id} className="category-stat" onClick={() => onCategory(c.id)}>
            <CategoryIcon name={c.icon} />
            <span className="category-stat-content">
              <span className="stat-line">
                <span>{c.name}</span>
                <strong>{money(c.value)} сум</strong>
              </span>
              <span className="progress">
                <i
                  style={{
                    width:
                      Math.min(100, Math.max(0, (Number(c.value) / Math.max(1, net)) * 100)) + "%",
                  }}
                />
              </span>
            </span>
          </button>
        ))
      ) : (
        <div className="empty">Добавьте первый расход, и здесь появится отчёт</div>
      )}
      {summary.days.length > 0 && (
        <>
          <h2 className="section-title">По дням</h2>
          <div className="day-chart">
            {summary.days.map((d) => (
              <div key={d.date} className="day-bar">
                <span>{DateTime.fromISO(d.date).setLocale("ru").toFormat("d LLL")}</span>
                <div className="progress">
                  <i
                    style={{
                      width: Math.max(0, Math.min(100, (Number(d.value) / maxDay) * 100)) + "%",
                    }}
                  />
                </div>
                <strong>{money(d.value)} сум</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

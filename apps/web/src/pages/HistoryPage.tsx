import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { DateTime } from "luxon";
import { Account, Category, Operation } from "../api";
import { request } from "@ui/lib/api-client";
import { MonthSwitch } from "@ui/components/MonthSwitch";
import { OperationRow } from "../components/OperationRow";
import { Sheet, SheetPresence } from "@ui/components/Sheet";
import { currentMonth, formatMoney } from "@ui/lib/format";
import { useRefresh } from "../lib/useRefresh";
import { OperationPanel } from "../panels/OperationPanel";

type Filter = "all" | "expense" | "income";

export function HistoryPage({
  month,
  setMonth,
  accounts,
  categories,
  timezone,
  categoryFilter,
  setCategoryFilter,
  onAdd,
}: {
  month: string;
  setMonth: (month: string) => void;
  accounts: Account[];
  categories: Category[];
  timezone: string;
  categoryFilter: string | null;
  setCategoryFilter: (id: string | null) => void;
  onAdd: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [older, setOlder] = useState<Operation[]>([]);
  const [cursorLoading, setCursorLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Operation | null>(null);
  const refresh = useRefresh();
  const params = () => {
    const p = new URLSearchParams({ month });
    if (search) p.set("q", search);
    if (filter !== "all") p.set("kind", filter);
    if (categoryFilter) p.set("categoryId", categoryFilter);
    return p;
  };
  const operationsQ = useQuery({
    queryKey: ["operations", month, search, filter, categoryFilter],
    queryFn: () =>
      request<{
        items: Operation[];
        count: number;
        nextCursor: string | null;
      }>("/transactions?" + params()),
  });
  useEffect(() => setOlder([]), [month, search, filter, categoryFilter]);
  const entries = [...(operationsQ.data?.items || []), ...older];
  const entriesByDay = entries.reduce((days, op) => {
    const day = days.get(op.localDate) || [];
    day.push(op);
    days.set(op.localDate, day);
    return days;
  }, new Map<string, Operation[]>());
  async function loadOlder() {
    if (!operationsQ.data?.nextCursor || cursorLoading) return;
    setCursorLoading(true);
    try {
      const p = params();
      p.set("cursor", older.length ? older[older.length - 1].id : operationsQ.data.nextCursor);
      const data = await request<{ items: Operation[] }>("/transactions?" + p);
      setOlder((v) => [...v, ...data.items]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить историю");
    } finally {
      setCursorLoading(false);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>История</h1>
        </div>
        <button className="icon-btn" aria-label="Добавить расход" onClick={onAdd}>
          <Plus size={21} />
        </button>
      </div>
      <MonthSwitch month={month} setMonth={setMonth} futureDisabled={month === currentMonth()} />
      <input
        className="field search"
        placeholder="Поиск по заметке или категории"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="segmented">
        {(["all", "expense", "income"] as const).map((k) => (
          <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>
            {k === "all" ? "Все" : k === "expense" ? "Расходы" : "Доходы"}
          </button>
        ))}
      </div>
      {categoryFilter && (
        <button className="filter-pill" onClick={() => setCategoryFilter(null)}>
          Категория · {categories.find((c) => c.id === categoryFilter)?.name} <X size={14} />
        </button>
      )}
      {operationsQ.error ? (
        <div className="empty">
          {operationsQ.error instanceof Error
            ? operationsQ.error.message
            : "Не удалось загрузить историю"}
          <button className="quiet full" onClick={() => void operationsQ.refetch()}>
            Повторить
          </button>
        </div>
      ) : operationsQ.isLoading ? (
        <div className="empty">Загружаем историю…</div>
      ) : entries.length ? (
        <>
          <div className="list">
            {[...entriesByDay].map(([date, items]) => (
              <div className="day-group" key={date}>
                <div className="day-heading">
                  <strong>{DateTime.fromISO(date).setLocale("ru").toFormat("d MMMM")}</strong>
                  {dayExpenses(items) && <span>Расходы {dayExpenses(items)}</span>}
                </div>
                {items.map((op) => (
                  <OperationRow
                    key={op.id}
                    op={op}
                    timezone={timezone}
                    onClick={() => setDetail(op)}
                  />
                ))}
              </div>
            ))}
          </div>
          {entries.length < (operationsQ.data?.count || 0) && (
            <button
              className="quiet full"
              disabled={cursorLoading}
              onClick={() => void loadOlder()}
            >
              {cursorLoading ? "Загружаем…" : "Показать ещё"}
            </button>
          )}
        </>
      ) : (
        <div className="empty">За выбранный период операций нет</div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <SheetPresence>
        {detail && (
          <Sheet title="Операция" onClose={() => setDetail(null)}>
            <OperationPanel
              operation={detail}
              accounts={accounts.filter((a) => !a.archived)}
              categories={categories}
              timezone={timezone}
              onDone={async () => {
                setDetail(null);
                await refresh();
              }}
              onRefresh={refresh}
            />
          </Sheet>
        )}
      </SheetPresence>
    </div>
  );
}

/** A day's spending per currency, e.g. "120 000 сум · 15,00 $"; empty when nothing was spent. */
function dayExpenses(operations: Operation[]) {
  const totals = new Map<string, number>();

  for (const op of operations) {
    if (op.kind !== "expense" && op.kind !== "refund") {
      continue;
    }

    const spent = op.kind === "expense" ? Number(op.amount) : -Number(op.amount);
    totals.set(op.currency, (totals.get(op.currency) ?? 0) + spent);
  }

  return [...totals].map(([currency, total]) => formatMoney(total, currency)).join(" · ");
}

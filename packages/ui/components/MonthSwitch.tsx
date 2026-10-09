import { ChevronLeft, ChevronRight } from "lucide-react";
import { DateTime } from "luxon";
import { monthLabel } from "../lib/format";

export function MonthSwitch({
  month,
  setMonth,
  futureDisabled,
}: {
  month: string;
  setMonth: (s: string) => void;
  futureDisabled: boolean;
}) {
  const previous = DateTime.fromISO(month + "-01")
    .minus({ months: 1 })
    .toFormat("yyyy-MM");
  const next = DateTime.fromISO(month + "-01")
    .plus({ months: 1 })
    .toFormat("yyyy-MM");
  return (
    <div className="month-switch">
      <button aria-label="Предыдущий месяц" onClick={() => setMonth(previous)}>
        <ChevronLeft size={18} />
      </button>
      <strong>{monthLabel(month)}</strong>
      <button aria-label="Следующий месяц" disabled={futureDisabled} onClick={() => setMonth(next)}>
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

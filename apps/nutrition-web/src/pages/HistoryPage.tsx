import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { CalendarDays, ChevronDown } from "lucide-react";
import { MonthSwitch } from "@ui/components/MonthSwitch";
import { Sheet, SheetPresence } from "@ui/components/Sheet";
import { DaySummary, historyQueryKey, Meal, NutritionProfile, useDay, useHistory } from "../api";
import { MealCard } from "../components/MealCard";
import { MealReview } from "../components/MealReview";
import { formatNumber } from "../lib/labels";
import { mealNames, mealTime } from "../lib/meal-names";

/** Days of a month with their totals; a day opens to its meals, a meal to its review. */
export function HistoryPage({
  profile,
  timezone,
}: {
  profile: NutritionProfile;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const thisMonth = DateTime.now().setZone(timezone).toFormat("yyyy-MM");
  const [month, setMonth] = useState(thisMonth);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<Meal | null>(null);
  const historyQ = useHistory(month);
  const days = historyQ.data?.days ?? [];

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["nutrition", "day"] });
    void queryClient.invalidateQueries({ queryKey: historyQueryKey(month) });
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>История</h1>
        </div>
      </div>
      <MonthSwitch
        month={month}
        setMonth={(next) => {
          setMonth(next);
          setOpenDate(null);
        }}
        futureDisabled={month >= thisMonth}
      />

      {days.length > 0 ? (
        <div className="history-list">
          {days.map((day) => (
            <HistoryDay
              key={day.date}
              day={day}
              target={profile.targets.kcal}
              timezone={timezone}
              open={openDate === day.date}
              onToggle={() => setOpenDate(openDate === day.date ? null : day.date)}
              onSelect={setSelected}
            />
          ))}
        </div>
      ) : (
        <div className="empty diary-empty">
          <CalendarDays size={28} />
          <span>
            {historyQ.isLoading ? "Загружаем историю…" : "В этом месяце записей пока нет"}
          </span>
        </div>
      )}

      <SheetPresence>
        {selected && (
          <Sheet title="Приём пищи" onClose={() => setSelected(null)}>
            <MealReview
              meal={selected}
              timezone={timezone}
              onChange={setSelected}
              onSaved={() => {
                setSelected(null);
                refresh();
              }}
              onDeleted={() => {
                setSelected(null);
                refresh();
              }}
            />
          </Sheet>
        )}
      </SheetPresence>
    </div>
  );
}

function HistoryDay({
  day,
  target,
  timezone,
  open,
  onToggle,
  onSelect,
}: {
  day: DaySummary;
  target: number;
  timezone: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (meal: Meal) => void;
}) {
  const { totals } = day;
  const date = DateTime.fromISO(day.date).setLocale("ru");
  const share = Math.min(100, (totals.kcal / target) * 100);
  const exceeded = totals.kcal > target;

  return (
    <div className="history-day">
      <button type="button" className="history-day-head" aria-expanded={open} onClick={onToggle}>
        <span className="history-day-text">
          <strong>{date.toFormat("d MMMM, ccc")}</strong>
          <small>
            Б {formatNumber(totals.proteinG)} · Ж {formatNumber(totals.fatG)} · У{" "}
            {formatNumber(totals.carbsG)} г
          </small>
        </span>
        <span className="meal-kcal">
          {formatNumber(totals.kcal)} <small>ккал</small>
        </span>
        <ChevronDown size={18} className="history-chevron" />
        <span className="history-bar" aria-hidden="true">
          <i className={exceeded ? "exceeded" : ""} style={{ width: `${share}%` }} />
        </span>
      </button>
      {open && <DayMeals date={day.date} timezone={timezone} onSelect={onSelect} />}
    </div>
  );
}

function DayMeals({
  date,
  timezone,
  onSelect,
}: {
  date: string;
  timezone: string;
  onSelect: (meal: Meal) => void;
}) {
  const dayQ = useDay(date);
  const meals = dayQ.data?.meals ?? [];
  const names = mealNames(meals, timezone);

  return (
    <div className="meal-list history-meals">
      {meals.map((meal) => (
        <MealCard
          key={meal.id}
          meal={meal}
          name={names.get(meal.id) ?? ""}
          time={mealTime(meal, timezone)}
          onClick={() => onSelect(meal)}
        />
      ))}
      {dayQ.isLoading && <span className="page-subtitle">Загружаем…</span>}
    </div>
  );
}

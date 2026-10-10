import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { UtensilsCrossed } from "lucide-react";
import { Sheet, SheetPresence } from "@ui/components/Sheet";
import { dayQueryKey, historyQueryKey, Meal, NutritionProfile, useDay, Workout } from "../api";
import { CalorieRing } from "../components/CalorieRing";
import { MacroCards } from "../components/MacroCards";
import { MealCard } from "../components/MealCard";
import { MealReview } from "../components/MealReview";
import { PendingMealCard } from "../components/PendingMealCard";
import { WorkoutRow } from "../components/WorkoutRow";
import { mealNames, mealTime } from "../lib/meal-names";
import { PendingMeals } from "../lib/pending-meals";
import type { MacroKey } from "../macroInfo";
import { MacroInfoPage } from "./MacroInfoPage";

const NOTHING_EATEN = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };

export function TodayPage({
  profile,
  timezone,
  pendingMeals,
  onMealSaved,
  onEditWorkout,
}: {
  profile: NutritionProfile;
  timezone: string;
  pendingMeals: PendingMeals;
  /** A recognized draft was written into the diary. */
  onMealSaved: (meal: Meal) => void;
  onEditWorkout: (workout: Workout) => void;
}) {
  const queryClient = useQueryClient();
  const now = DateTime.now().setZone(timezone);
  const date = now.toISODate()!;
  const dayQ = useDay(date);
  const [selected, setSelected] = useState<Meal | null>(null);
  const [macroDetail, setMacroDetail] = useState<MacroKey | null>(null);

  const meals = dayQ.data?.meals ?? [];
  const eaten = dayQ.data?.totals ?? NOTHING_EATEN;
  const { pending } = pendingMeals;
  const names = mealNames([...meals, ...pending], timezone);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: dayQueryKey(date) });
    void queryClient.invalidateQueries({ queryKey: historyQueryKey(date.slice(0, 7)) });
    void pendingMeals.refresh();
  }

  function reviewChanged(meal: Meal) {
    setSelected(meal);
    pendingMeals.update(meal);
  }

  function reviewSaved(meal: Meal) {
    if (selected?.status === "draft") {
      onMealSaved(meal);
    }
    setSelected(null);
    refresh();
  }

  function reviewDeleted() {
    setSelected(null);
    refresh();
  }

  if (macroDetail) {
    return (
      <MacroInfoPage
        macro={macroDetail}
        eaten={eaten[macroDetail]}
        target={profile.targets[macroDetail]}
        onBack={() => setMacroDetail(null)}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Сегодня</h1>
          <p className="page-subtitle">{now.setLocale("ru").toFormat("d MMMM, cccc")}</p>
        </div>
      </div>
      <section className="card">
        <CalorieRing
          eaten={eaten.kcal}
          target={profile.targets.kcal}
          burned={dayQ.data?.burnedKcal}
        />
      </section>
      <MacroCards eaten={eaten} targets={profile.targets} onSelect={setMacroDetail} />

      <h2 className="section-title">Приёмы пищи</h2>
      {meals.length > 0 || pending.length > 0 ? (
        <div className="meal-list">
          {pending.map((entry) => (
            <PendingMealCard
              key={entry.id}
              entry={entry}
              name={names.get(entry.id) ?? ""}
              timezone={timezone}
              onOpen={() => entry.meal && setSelected(entry.meal)}
              onRetry={() => void pendingMeals.retry(entry)}
              onDismiss={() => void pendingMeals.dismiss(entry)}
            />
          ))}
          {meals.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              name={names.get(meal.id) ?? ""}
              time={mealTime(meal, timezone)}
              onClick={() => setSelected(meal)}
            />
          ))}
        </div>
      ) : (
        <div className="empty diary-empty">
          <UtensilsCrossed size={28} />
          <span>
            {dayQ.isLoading
              ? "Загружаем дневник…"
              : "Сегодня ещё ничего не записано. Нажмите «+», чтобы добавить приём пищи."}
          </span>
        </div>
      )}

      {(dayQ.data?.workouts.length ?? 0) > 0 && (
        <>
          <h2 className="section-title">Тренировки</h2>
          <div className="meal-list">
            {dayQ.data!.workouts.map((workout) => (
              <WorkoutRow
                key={workout.id}
                workout={workout}
                timezone={timezone}
                onClick={() => onEditWorkout(workout)}
              />
            ))}
          </div>
        </>
      )}

      <SheetPresence>
        {selected && (
          <Sheet title={names.get(selected.id) ?? "Приём пищи"} onClose={() => setSelected(null)}>
            <MealReview
              meal={selected}
              timezone={timezone}
              onChange={reviewChanged}
              onSaved={reviewSaved}
              onDeleted={reviewDeleted}
            />
          </Sheet>
        )}
      </SheetPresence>
    </div>
  );
}

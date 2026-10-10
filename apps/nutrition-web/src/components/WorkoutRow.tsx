import { Dumbbell } from "lucide-react";
import { DateTime } from "luxon";
import { Workout } from "../api";
import { formatNumber } from "../lib/labels";

/** One workout in the day list; looks like a meal card. */
export function WorkoutRow({
  workout,
  timezone,
  onClick,
}: {
  workout: Workout;
  timezone: string;
  onClick: () => void;
}) {
  const time = DateTime.fromISO(workout.performedAt).setZone(timezone).toFormat("HH:mm");
  const details = [workout.note, workout.durationMin && `${workout.durationMin} мин`]
    .filter(Boolean)
    .join(" · ");

  return (
    <button type="button" className="meal-card" onClick={onClick}>
      <span className="meal-thumb">
        <Dumbbell size={20} />
      </span>
      <span className="meal-text">
        <strong>
          Тренировка <small>{time}</small>
        </strong>
        {details && <small>{details}</small>}
      </span>
      <span className="meal-kcal">
        {formatNumber(workout.kcal)} <small>ккал</small>
      </span>
    </button>
  );
}

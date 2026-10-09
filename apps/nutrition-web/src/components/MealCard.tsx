import { PenLine } from "lucide-react";
import { Meal, usePhotoUrl } from "../api";
import { formatNumber } from "../lib/labels";
import { itemsSummary } from "../lib/meal-names";

/** One meal in the day list: photo thumbnail, name and time, what was eaten, calories. */
export function MealCard({
  meal,
  name,
  time,
  onClick,
}: {
  meal: Meal;
  name: string;
  time: string;
  onClick: () => void;
}) {
  const thumbnail = usePhotoUrl(meal.photoId, "thumb");

  return (
    <button type="button" className="meal-card" onClick={onClick}>
      <span className="meal-thumb">
        {thumbnail.data ? <img src={thumbnail.data} alt="" /> : <PenLine size={20} />}
      </span>
      <span className="meal-text">
        <strong>
          {name} <small>{time}</small>
        </strong>
        <small>{itemsSummary(meal)}</small>
      </span>
      <span className="meal-kcal">
        {formatNumber(meal.totals.kcal)} <small>ккал</small>
      </span>
    </button>
  );
}

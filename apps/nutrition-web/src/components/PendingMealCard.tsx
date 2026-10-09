import { PenLine, X } from "lucide-react";
import { usePhotoUrl } from "../api";
import { formatNumber } from "../lib/labels";
import { mealTime } from "../lib/meal-names";
import { PendingMeal } from "../lib/pending-meals";

/**
 * A meal that is not in the diary yet: being recognized (scan animation over the photo),
 * waiting for review, or failed. Looks like MealCard so it does not jump when saved.
 */
export function PendingMealCard({
  entry,
  name,
  timezone,
  onOpen,
  onRetry,
  onDismiss,
}: {
  entry: PendingMeal;
  name: string;
  timezone: string;
  onOpen: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { status, meal } = entry;
  // The local thumbnail is shown while uploading; afterwards the stored one.
  const stored = usePhotoUrl(entry.preview ? null : entry.photoId, "thumb");
  const image = entry.preview ?? stored.data;

  return (
    <div className={`meal-card pending ${status}`}>
      <button
        type="button"
        className="meal-card-main"
        disabled={status === "analyzing"}
        onClick={status === "failed" ? onRetry : onOpen}
      >
        <span className={"meal-thumb" + (status === "analyzing" ? " scanning" : "")}>
          {image ? <img src={image} alt="" /> : <PenLine size={20} />}
        </span>
        <span className="meal-text">
          <strong>
            {name} <small>{mealTime(entry, timezone)}</small>
          </strong>
          <small className="pending-note">
            {status === "analyzing" && "Распознаётся…"}
            {status === "ready" && "Проверьте и запишите"}
            {status === "failed" && `${entry.error}. Нажмите, чтобы повторить`}
          </small>
        </span>
        {status === "ready" && meal && (
          <span className="meal-kcal">
            {formatNumber(meal.totals.kcal)} <small>ккал</small>
          </span>
        )}
      </button>
      {status !== "analyzing" && (
        <button type="button" className="meal-dismiss" aria-label="Убрать" onClick={onDismiss}>
          <X size={18} />
        </button>
      )}
    </div>
  );
}

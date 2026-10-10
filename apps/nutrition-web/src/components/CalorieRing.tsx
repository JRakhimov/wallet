import { formatNumber } from "../lib/labels";

const SIZE = 168;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Eaten calories against the daily target. */
export function CalorieRing({
  eaten,
  target,
  burned = 0,
}: {
  eaten: number;
  target: number;
  /** Calories burned in workouts today: shown next to the ring, the target stays the same. */
  burned?: number;
}) {
  const progress = target > 0 ? Math.min(1, eaten / target) : 0;
  const remaining = target - eaten;
  const over = remaining < 0;

  return (
    <div className={"calorie-ring " + (over ? "over" : "")}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle
          className="ring-track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
        />
        <circle
          className="ring-value"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
        />
      </svg>
      <div className="ring-label">
        <strong>{formatNumber(Math.abs(remaining))}</strong>
        <span>{over ? "ккал сверх нормы" : "ккал осталось"}</span>
      </div>
      <p className="ring-caption">
        Съедено {formatNumber(eaten)} из {formatNumber(target)} ккал
      </p>
      {burned > 0 && <p className="ring-burned">🔥 Тренировки: +{formatNumber(burned)} ккал</p>}
    </div>
  );
}

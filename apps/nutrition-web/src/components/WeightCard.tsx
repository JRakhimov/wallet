import { DateTime } from "luxon";
import { useWeight, WeightEntry } from "../api";
import { formatKg, formatKgChange } from "../lib/weight";

const CHART_DAYS = 90;
const CHART_WIDTH = 300;
const CHART_HEIGHT = 64;
const CHART_PADDING = 4;

/** Current weight, its change over a week and a month, and a line of the last 90 days. */
export function WeightCard({ onRecord }: { onRecord: () => void }) {
  const weightQ = useWeight();
  const log = weightQ.data;

  return (
    <section className="card">
      <h2 className="card-title">Вес</h2>

      {log?.current != null ? (
        <>
          <div className="weight-now">
            <strong>{formatKg(log.current)}</strong>

            <span className="weight-changes">
              <WeightChange label="за неделю" kg={log.change7} />
              <WeightChange label="за месяц" kg={log.change30} />
            </span>
          </div>

          <WeightChart entries={log.entries} />
        </>
      ) : (
        <p className="card-note">Записывайте вес, чтобы видеть, как он меняется.</p>
      )}

      <button className="secondary full" onClick={onRecord}>
        Записать вес
      </button>
    </section>
  );
}

function WeightChange({ label, kg }: { label: string; kg: number | null }) {
  if (kg === null) {
    return null;
  }

  return (
    <span>
      {formatKgChange(kg)} {label}
    </span>
  );
}

/** A plain line of weigh-ins; hidden until there are two of them in the period. */
function WeightChart({ entries }: { entries: WeightEntry[] }) {
  const latest = entries.at(-1);
  if (!latest) {
    return null;
  }

  const end = DateTime.fromISO(latest.date);
  const start = end.minus({ days: CHART_DAYS });
  const recent = entries.filter((entry) => DateTime.fromISO(entry.date) >= start);
  if (recent.length < 2) {
    return null;
  }

  const weights = recent.map((entry) => entry.weightKg);
  const min = Math.min(...weights);
  const range = Math.max(...weights) - min || 1;
  const firstDay = DateTime.fromISO(recent[0].date);
  const days = end.diff(firstDay, "days").days || 1;

  const points = recent.map((entry) => {
    const offset = DateTime.fromISO(entry.date).diff(firstDay, "days").days;
    const x = CHART_PADDING + (offset / days) * (CHART_WIDTH - 2 * CHART_PADDING);
    const y =
      CHART_PADDING + (1 - (entry.weightKg - min) / range) * (CHART_HEIGHT - 2 * CHART_PADDING);

    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      className="weight-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Вес за последние ${CHART_DAYS} дней`}
    >
      <polyline points={points.join(" ")} />
    </svg>
  );
}

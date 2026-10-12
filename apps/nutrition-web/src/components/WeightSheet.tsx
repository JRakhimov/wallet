import { useState } from "react";
import { DateTime } from "luxon";
import { Trash2 } from "lucide-react";
import { AmountInput } from "@ui/components/AmountInput";
import { Sheet } from "@ui/components/Sheet";
import { deleteWeight, saveWeight, useWeight, useWeightUpdate, WeightLog } from "../api";
import { formatKg, weighInDate } from "../lib/weight";

const WEIGHT_KG = { min: 30, max: 300 };

/** Weigh-in form and the log below it; a weigh-in on a day already logged replaces it. */
export function WeightSheet({
  timezone,
  onClose,
  onSaved,
}: {
  timezone: string;
  onClose: () => void;
  onSaved: (log: WeightLog) => void;
}) {
  const weightQ = useWeight();
  const updateWeight = useWeightUpdate();
  const today = DateTime.now().setZone(timezone).toISODate()!;

  const [weight, setWeight] = useState(() => String(weightQ.data?.current ?? ""));
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const kg = Number(weight);
  const valid = kg >= WEIGHT_KG.min && kg <= WEIGHT_KG.max;
  const entries = [...(weightQ.data?.entries ?? [])].reverse();

  async function run(action: () => Promise<WeightLog>, done?: (log: WeightLog) => void) {
    setBusy(true);
    setError("");

    try {
      const log = await updateWeight(action);
      done?.(log);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(() => saveWeight({ date, weightKg: kg }), onSaved);

  return (
    <Sheet title="Вес" onClose={onClose}>
      <div className="sheet-body">
        <label className="field-label">
          Вес, кг
          <AmountInput value={weight} onChange={setWeight} placeholder="72,5" />
        </label>

        <label className="field-label">
          Дата
          <input
            className="field"
            type="date"
            max={today}
            value={date}
            onChange={(event) => setDate(event.target.value || date)}
          />
        </label>

        <p className="sheet-desc">
          Последнее взвешивание становится весом профиля, и нормы на день пересчитываются.
        </p>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="primary full"
          disabled={busy || !valid}
          onClick={() => void save()}
        >
          {busy ? "Сохраняем…" : "Записать"}
        </button>

        {entries.length > 0 && (
          <div className="weight-history">
            <h3 className="sheet-subtitle">История</h3>

            {entries.map((entry) => (
              <div key={entry.id} className="manage-row">
                <span className="manage-text">{weighInDate(entry.date)}</span>
                <span className="weight-history-value">{formatKg(entry.weightKg)}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Удалить запись за ${weighInDate(entry.date)}`}
                  disabled={busy}
                  onClick={() => void run(() => deleteWeight(entry.id))}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

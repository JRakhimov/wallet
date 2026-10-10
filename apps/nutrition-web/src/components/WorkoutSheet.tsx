import { useRef, useState } from "react";
import { DateTime } from "luxon";
import { Sheet } from "@ui/components/Sheet";
import { createWorkout, deleteWorkout, updateWorkout, Workout } from "../api";

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 4);

/**
 * Add or edit a workout: the active calories burned (as the watch shows them after a
 * session), optionally its length and kind. Does not change the daily targets.
 */
export function WorkoutSheet({
  workout,
  timezone,
  onClose,
  onSaved,
}: {
  /** Set when editing. */
  workout: Workout | null;
  timezone: string;
  onClose: () => void;
  onSaved: (workout: Workout | null) => void;
}) {
  const performed = workout
    ? DateTime.fromISO(workout.performedAt).setZone(timezone)
    : DateTime.now().setZone(timezone);
  const [kcal, setKcal] = useState(workout ? String(workout.kcal) : "");
  const [minutes, setMinutes] = useState(workout?.durationMin ? String(workout.durationMin) : "");
  const [note, setNote] = useState(workout?.note ?? "");
  const [time, setTime] = useState(performed.toFormat("HH:mm"));
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState("");
  // One key per opened sheet, so a retried save does not create a second workout.
  const idempotencyKey = useRef(crypto.randomUUID());

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<void>) {
    setBusy(kind);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Что-то пошло не так");
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", async () => {
      const [hour, minute] = time.split(":").map(Number);
      const input = {
        performedAt: performed.set({ hour, minute, second: 0, millisecond: 0 }).toISO()!,
        kcal: Number(kcal),
        durationMin: minutes ? Number(minutes) : null,
        note: note.trim(),
      };
      onSaved(
        workout
          ? await updateWorkout(workout.id, input)
          : await createWorkout(input, idempotencyKey.current),
      );
    });

  const remove = () =>
    run("delete", async () => {
      await deleteWorkout(workout!.id);
      onSaved(null);
    });

  return (
    <Sheet title={workout ? "Тренировка" : "Новая тренировка"} onClose={onClose}>
      <div className="sheet-body">
        <label className="field-label">
          Сожжено, ккал
          <input
            className="field"
            inputMode="numeric"
            placeholder="Активные калории с часов, например 420"
            value={kcal}
            onChange={(event) => setKcal(digitsOnly(event.target.value))}
          />
        </label>
        <p className="sheet-desc">
          Берите активные калории, не общие. Это справочная цифра: дневная норма из-за неё не
          меняется.
        </p>
        <label className="field-label">
          Длительность, мин
          <input
            className="field"
            inputMode="numeric"
            placeholder="Необязательно"
            value={minutes}
            onChange={(event) => setMinutes(digitsOnly(event.target.value))}
          />
        </label>
        <label className="field-label">
          Название
          <input
            className="field"
            maxLength={100}
            placeholder="Необязательно: бег, зал, плавание"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <label className="field-label">
          Время
          <input
            className="field"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value || time)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="primary full"
          disabled={busy !== null || !Number(kcal)}
          onClick={() => void save()}
        >
          {busy === "save" ? "Сохраняем…" : "Сохранить"}
        </button>
        {workout && (
          <button
            type="button"
            className="danger-link"
            disabled={busy !== null}
            onClick={() => void remove()}
          >
            {busy === "delete" ? "Удаляем…" : "Удалить тренировку"}
          </button>
        )}
      </div>
    </Sheet>
  );
}

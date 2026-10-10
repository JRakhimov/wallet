import { useRef, useState } from "react";
import { X } from "lucide-react";
import { SelectField } from "@ui/components/SelectField";
import { Sheet } from "@ui/components/Sheet";
import { createTask, deleteTask, Repeat, Task, TaskInput, updateTask } from "../api";
import { plusDays, todayIn } from "../lib/due";
import { REPEAT_OPTIONS, WEEKDAYS } from "../lib/repeat";

type DateMode = "none" | "today" | "tomorrow" | "other";

const DATE_MODES: { value: DateMode; label: string }[] = [
  { value: "none", label: "Без срока" },
  { value: "today", label: "Сегодня" },
  { value: "tomorrow", label: "Завтра" },
  { value: "other", label: "Дата" },
];

const MAX_TITLE = 200;
const MAX_NOTE = 2000;

function dateModeOf(dueDate: string | null, today: string): DateMode {
  if (!dueDate) {
    return "none";
  }

  if (dueDate === today) {
    return "today";
  }

  return dueDate === plusDays(today, 1) ? "tomorrow" : "other";
}

/** ISO weekday (1–7) of a yyyy-MM-dd date. */
function weekdayOf(date: string) {
  return ((new Date(`${date}T12:00:00`).getDay() + 6) % 7) + 1;
}

/**
 * Add or edit a task: text, optional note, date, time and repeat. Without a date it is a
 * note; a date without a time is reminded about in the morning.
 */
export function TaskSheet({
  task,
  initialDate,
  timezone,
  onClose,
  onSaved,
  onDeleted,
}: {
  /** Set when editing. */
  task: Task | null;
  /** Date of a new task, depending on the tab it is added from. */
  initialDate: string | null;
  timezone: string;
  onClose: () => void;
  onSaved: (task: Task, isNew: boolean) => void;
  onDeleted: (task: Task) => void;
}) {
  const today = todayIn(timezone);

  const [title, setTitle] = useState(task?.title ?? "");
  const [note, setNote] = useState(task?.note ?? "");
  const [dueDate, setDueDate] = useState(task ? task.dueDate : initialDate);
  const [dateMode, setDateMode] = useState(dateModeOf(dueDate, today));
  const [dueTime, setDueTime] = useState(task?.dueTime ?? "");
  const [repeat, setRepeat] = useState<Repeat>(task?.repeat ?? "none");
  const [repeatDays, setRepeatDays] = useState(task?.repeatDays ?? []);

  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState("");

  // One key per opened sheet, so a retried save does not create a second task.
  const idempotencyKey = useRef(crypto.randomUUID());

  function chooseDateMode(mode: DateMode) {
    setDateMode(mode);

    const dates: Record<DateMode, string | null> = {
      none: null,
      today,
      tomorrow: plusDays(today, 1),
      other: dueDate ?? plusDays(today, 2),
    };
    setDueDate(dates[mode]);

    if (mode === "none") {
      setDueTime("");
      setRepeat("none");
    }
  }

  function chooseRepeat(value: string) {
    setRepeat(value as Repeat);

    if (value === "weekly" && repeatDays.length === 0 && dueDate) {
      setRepeatDays([weekdayOf(dueDate)]);
    }
  }

  function toggleDay(day: number) {
    setRepeatDays((days) =>
      days.includes(day) ? days.filter((item) => item !== day) : [...days, day].sort(),
    );
  }

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
      const input: TaskInput = {
        title: title.trim(),
        note: note.trim(),
        dueDate,
        dueTime: dueDate && dueTime ? dueTime : null,
        repeat: dueDate ? repeat : "none",
        repeatDays: repeat === "weekly" ? repeatDays : [],
      };

      const saved = task
        ? await updateTask(task, input)
        : await createTask(input, idempotencyKey.current);

      onSaved(saved, !task);
    });

  const remove = () =>
    run("delete", async () => {
      await deleteTask(task!);
      onDeleted(task!);
    });

  const canSave = title.trim() !== "" && (repeat !== "weekly" || repeatDays.length > 0);

  return (
    <Sheet title={task ? "Задача" : "Новая задача"} onClose={onClose}>
      <div className="sheet-body">
        <label className="field-label">
          Что сделать
          <textarea
            className="field task-title-field"
            rows={2}
            maxLength={MAX_TITLE}
            placeholder="Например, позвонить в банк"
            value={title}
            autoFocus={!task}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="field-label">
          Заметка
          <textarea
            className="field task-note-field"
            rows={3}
            maxLength={MAX_NOTE}
            placeholder="Необязательно"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <div>
          <span className="field-label">Когда</span>
          <div className="segmented date-modes">
            {DATE_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                className={dateMode === mode.value ? "active" : ""}
                onClick={() => chooseDateMode(mode.value)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {dateMode === "other" && (
          <label className="field-label">
            Дата
            <input
              className="field"
              type="date"
              value={dueDate ?? ""}
              onChange={(event) => setDueDate(event.target.value || dueDate)}
            />
          </label>
        )}

        {dueDate && (
          <>
            <label className="field-label">
              Время напоминания
              <span className="task-time">
                <input
                  className="field"
                  type="time"
                  value={dueTime}
                  onChange={(event) => setDueTime(event.target.value)}
                />
                {dueTime && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Убрать время"
                    onClick={() => setDueTime("")}
                  >
                    <X size={18} />
                  </button>
                )}
              </span>
            </label>

            {!dueTime && <p className="sheet-desc">Без времени бот напомнит в 09:00.</p>}

            <SelectField
              label="Повтор"
              value={repeat}
              options={REPEAT_OPTIONS}
              onChange={chooseRepeat}
            />

            {repeat === "weekly" && (
              <div className="weekday-picker" role="group" aria-label="Дни недели">
                {WEEKDAYS.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={repeatDays.includes(index + 1)}
                    className={repeatDays.includes(index + 1) ? "active" : ""}
                    onClick={() => toggleDay(index + 1)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="primary full"
          disabled={busy !== null || !canSave}
          onClick={() => void save()}
        >
          {busy === "save" ? "Сохраняем…" : "Сохранить"}
        </button>

        {task && (
          <button
            type="button"
            className="danger-link"
            disabled={busy !== null}
            onClick={() => void remove()}
          >
            {busy === "delete" ? "Удаляем…" : "Удалить задачу"}
          </button>
        )}
      </div>
    </Sheet>
  );
}

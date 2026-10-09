import { useState } from "react";
import { DateTime } from "luxon";
import { Plus, X } from "lucide-react";
import { AmountInput } from "@ui/components/AmountInput";
import { Confidence, deleteMeal, Meal, MealItem, reanalyzeMeal, saveMeal, Totals } from "../api";
import { formatNumber } from "../lib/labels";

/** An item while it is being edited: nutrients per 100 g, so changing grams rescales them. */
type EditableItem = {
  key: string;
  name: string;
  grams: string;
  per100: Totals;
  confidence: Confidence | null;
};

const NUTRIENTS: (keyof Totals)[] = ["kcal", "proteinG", "fatG", "carbsG"];

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

function toEditable(item: MealItem): EditableItem {
  const per100 = {} as Totals;
  for (const key of NUTRIENTS) {
    per100[key] = item.grams > 0 ? (item[key] / item.grams) * 100 : 0;
  }
  return {
    key: crypto.randomUUID(),
    name: item.name,
    grams: String(item.grams),
    per100,
    confidence: item.confidence,
  };
}

function toItem(item: EditableItem): MealItem {
  const grams = Number(item.grams) || 0;
  const scaled = {} as Totals;
  for (const key of NUTRIENTS) {
    scaled[key] = oneDecimal((item.per100[key] * grams) / 100);
  }
  return { name: item.name.trim(), grams, ...scaled, confidence: item.confidence };
}

function totalsOf(items: MealItem[]): Totals {
  const sum = (key: keyof Totals) => items.reduce((total, item) => total + item[key], 0);
  return { kcal: sum("kcal"), proteinG: sum("proteinG"), fatG: sum("fatG"), carbsG: sum("carbsG") };
}

/**
 * Review and edit of a meal: a fresh draft from recognition or a saved diary entry.
 * Saving a draft adds it to the diary.
 */
export function MealReview({
  meal,
  timezone,
  onChange,
  onSaved,
  onDeleted,
}: {
  meal: Meal;
  timezone: string;
  /** A correction produced a new version of the draft. */
  onChange: (meal: Meal) => void;
  onSaved: (meal: Meal) => void;
  onDeleted: () => void;
}) {
  const eatenAt = DateTime.fromISO(meal.eatenAt).setZone(timezone);
  const [items, setItems] = useState(() => meal.items.map(toEditable));
  const [time, setTime] = useState(eatenAt.toFormat("HH:mm"));
  const [clarification, setClarification] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<"save" | "clarify" | "delete" | null>(null);
  const [error, setError] = useState("");

  const isDraft = meal.status === "draft";
  const current = items.map(toItem);
  const totals = totalsOf(current);

  function update(key: string, patch: Partial<EditableItem>) {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)));
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
      const invalid = current.find((item) => !item.name || item.grams <= 0);
      if (!current.length || invalid) {
        throw new Error(
          current.length
            ? "У каждого блюда должны быть название и вес"
            : "Добавьте хотя бы одно блюдо",
        );
      }
      const [hour, minute] = time.split(":").map(Number);
      const savedAt = eatenAt.set({ hour, minute, second: 0, millisecond: 0 });
      onSaved(
        await saveMeal(meal.id, {
          eatenAt: savedAt.toISO()!,
          comment: meal.comment,
          items: current,
        }),
      );
    });

  const clarify = () =>
    run("clarify", async () => {
      const updated = await reanalyzeMeal(meal.id, clarification);
      setItems(updated.items.map(toEditable));
      setClarification("");
      onChange(updated);
    });

  const remove = () =>
    run("delete", async () => {
      await deleteMeal(meal.id);
      onDeleted();
    });

  return (
    <div className="sheet-body meal-review">
      <div className="review-totals">
        <strong>{formatNumber(totals.kcal)} ккал</strong>
        <span>
          Б {formatNumber(totals.proteinG)} · Ж {formatNumber(totals.fatG)} · У{" "}
          {formatNumber(totals.carbsG)} г
        </span>
      </div>

      <div className="review-items">
        {items.map((item) => {
          const value = toItem(item);
          return (
            <div key={item.key} className="review-item">
              <div className="review-item-head">
                <input
                  className="review-item-name"
                  value={item.name}
                  aria-label="Название блюда"
                  maxLength={120}
                  onChange={(event) => update(item.key, { name: event.target.value })}
                />
                <button
                  type="button"
                  className="icon-btn review-remove"
                  aria-label={`Убрать ${item.name}`}
                  onClick={() => setItems((list) => list.filter((other) => other.key !== item.key))}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="review-item-values">
                <label className="review-grams">
                  <AmountInput
                    value={item.grams}
                    onChange={(grams) => update(item.key, { grams })}
                    aria-label="Вес, г"
                  />
                  <span>г</span>
                </label>
                <span className="review-nutrients">
                  {formatNumber(value.kcal)} ккал · Б {formatNumber(value.proteinG)} · Ж{" "}
                  {formatNumber(value.fatG)} · У {formatNumber(value.carbsG)}
                </span>
              </div>
              {item.confidence === "low" && <span className="tag">примерно</span>}
            </div>
          );
        })}
      </div>

      {adding ? (
        <ManualItemForm
          onAdd={(item) => {
            setItems((list) => [...list, toEditable(item)]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="quiet full" onClick={() => setAdding(true)}>
          <Plus size={18} /> Добавить блюдо вручную
        </button>
      )}

      {meal.assumptions.length > 0 && (
        <div className="review-notes">
          <span>Модель предположила</span>
          <ul>
            {meal.assumptions.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      )}

      {isDraft && (
        <div className="review-clarify">
          {meal.questions.length > 0 && (
            <div className="review-notes">
              <span>Уточните, если можете</span>
              <ul>
                {meal.questions.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          )}
          <label className="field-label">
            Уточнение
            <textarea
              className="field"
              rows={2}
              maxLength={500}
              placeholder="Например: порция в два раза больше, без хлеба"
              value={clarification}
              onChange={(event) => setClarification(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary full"
            disabled={busy !== null || !clarification.trim()}
            onClick={() => void clarify()}
          >
            {busy === "clarify" ? "Пересчитываем…" : "Уточнить"}
          </button>
        </div>
      )}

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
        disabled={busy !== null}
        onClick={() => void save()}
      >
        {busy === "save" ? "Сохраняем…" : isDraft ? "Записать в дневник" : "Сохранить"}
      </button>
      <button
        type="button"
        className="danger-link"
        disabled={busy !== null}
        onClick={() => void remove()}
      >
        {busy === "delete" ? "Удаляем…" : "Удалить приём пищи"}
      </button>
    </div>
  );
}

/** Item typed in by hand: values for the entered weight. */
function ManualItemForm({
  onAdd,
  onCancel,
}: {
  onAdd: (item: MealItem) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    grams: "",
    kcal: "",
    proteinG: "",
    fatG: "",
    carbsG: "",
  });
  const [error, setError] = useState("");
  const set = (key: keyof typeof draft) => (value: string) => setDraft({ ...draft, [key]: value });

  function add() {
    const grams = Number(draft.grams);
    if (!draft.name.trim() || !(grams > 0)) {
      setError("Укажите название и вес");
      return;
    }
    onAdd({
      name: draft.name.trim(),
      grams,
      kcal: Number(draft.kcal) || 0,
      proteinG: Number(draft.proteinG) || 0,
      fatG: Number(draft.fatG) || 0,
      carbsG: Number(draft.carbsG) || 0,
      confidence: null,
    });
  }

  return (
    <div className="manual-item">
      <input
        className="field"
        placeholder="Название"
        maxLength={120}
        value={draft.name}
        onChange={(event) => set("name")(event.target.value)}
      />
      <div className="manual-item-grid">
        <AmountInput value={draft.grams} onChange={set("grams")} placeholder="Вес, г" />
        <AmountInput value={draft.kcal} onChange={set("kcal")} placeholder="Ккал" />
        <AmountInput value={draft.proteinG} onChange={set("proteinG")} placeholder="Белки, г" />
        <AmountInput value={draft.fatG} onChange={set("fatG")} placeholder="Жиры, г" />
        <AmountInput value={draft.carbsG} onChange={set("carbsG")} placeholder="Углеводы, г" />
      </div>
      {error && <span className="field-error">{error}</span>}
      <div className="manual-item-actions">
        <button type="button" className="quiet" onClick={onCancel}>
          Отмена
        </button>
        <button type="button" className="secondary" onClick={add}>
          Добавить
        </button>
      </div>
    </div>
  );
}

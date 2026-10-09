import { useState } from "react";
import {
  DailyTargets,
  NutritionProfile,
  saveTargets,
  TargetOverrides,
  useProfileUpdate,
} from "../api";

const FIELDS: { key: keyof DailyTargets; label: string; unit: string }[] = [
  { key: "kcal", label: "Калории", unit: "ккал" },
  { key: "proteinG", label: "Белки", unit: "г" },
  { key: "fatG", label: "Жиры", unit: "г" },
  { key: "carbsG", label: "Углеводы", unit: "г" },
];

type Draft = Record<keyof DailyTargets, string>;

/**
 * Manual daily targets. An empty field means "use the calculated value",
 * shown as the placeholder.
 */
export function TargetsPanel({
  profile,
  onDone,
}: {
  profile: NutritionProfile;
  onDone: () => void;
}) {
  const updateProfile = useProfileUpdate();
  const [draft, setDraft] = useState<Draft>(() => {
    const value = (key: keyof DailyTargets) =>
      profile.overridden[key] ? String(profile.targets[key]) : "";
    return {
      kcal: value("kcal"),
      proteinG: value("proteinG"),
      fatG: value("fatG"),
      carbsG: value("carbsG"),
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(overrides: TargetOverrides) {
    setBusy(true);
    setError("");
    try {
      await updateProfile(() => saveTargets(overrides));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить нормы");
    } finally {
      setBusy(false);
    }
  }

  const toOverride = (value: string) => (value.trim() ? Number(value) : null);
  // For targets set automatically the effective value is the automatic one; carbs, for example,
  // follow manual calories. For manual targets show the plain calculated value instead.
  const automaticValue = (key: keyof DailyTargets) =>
    profile.overridden[key] ? profile.calculated[key] : profile.targets[key];

  return (
    <div className="sheet-body">
      <p className="sheet-desc">
        Оставьте поле пустым, чтобы значение считалось автоматически. Углеводы без ручного значения
        заполняют остаток калорий.
      </p>
      {FIELDS.map(({ key, label, unit }) => (
        <label key={key} className="field-label">
          {label}, {unit}
          <input
            className="field"
            inputMode="numeric"
            placeholder={`${automaticValue(key)} (авто)`}
            value={draft[key]}
            onChange={(event) =>
              setDraft({ ...draft, [key]: event.target.value.replace(/\D/g, "").slice(0, 4) })
            }
          />
        </label>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary full"
        disabled={busy}
        onClick={() =>
          void save({
            kcal: toOverride(draft.kcal),
            proteinG: toOverride(draft.proteinG),
            fatG: toOverride(draft.fatG),
            carbsG: toOverride(draft.carbsG),
          })
        }
      >
        {busy ? "Сохраняем…" : "Сохранить"}
      </button>
      <button
        className="quiet full"
        disabled={busy}
        onClick={() => void save({ kcal: null, proteinG: null, fatG: null, carbsG: null })}
      >
        Вернуть расчётные значения
      </button>
    </div>
  );
}

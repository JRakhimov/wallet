import { useState } from "react";
import { Check } from "lucide-react";
import { AmountInput } from "@ui/components/AmountInput";
import { ActivityLevel, BodyData, NutritionProfile, Sex } from "../api";
import { activityOptions, sexOptions } from "../lib/labels";

/** Form values as typed; numbers stay strings until validated. */
export type BodyDraft = {
  sex: Sex | null;
  birthDate: string;
  heightCm: string;
  weightKg: string;
  activityLevel: ActivityLevel | null;
};

// Same limits as the API validation.
const HEIGHT_CM = { min: 120, max: 230 };
const WEIGHT_KG = { min: 30, max: 300 };

export function draftFromProfile(profile?: NutritionProfile): BodyDraft {
  return {
    sex: profile?.sex ?? null,
    birthDate: profile?.birthDate ?? "",
    heightCm: profile ? String(profile.heightCm) : "",
    weightKg: profile ? String(profile.weightKg) : "",
    activityLevel: profile?.activityLevel ?? null,
  };
}

export function useBodyDraft(profile?: NutritionProfile) {
  const [draft, setDraft] = useState<BodyDraft>(() => draftFromProfile(profile));
  const update = (patch: Partial<BodyDraft>) => setDraft((current) => ({ ...current, ...patch }));
  return { draft, update };
}

/** Field-level errors; empty object when the part of the form is valid. */
export function validateBody(draft: BodyDraft, fields: (keyof BodyDraft)[]) {
  const errors: Partial<Record<keyof BodyDraft, string>> = {};
  const height = Number(draft.heightCm);
  const weight = Number(draft.weightKg);

  if (fields.includes("sex") && !draft.sex) {
    errors.sex = "Выберите пол";
  }
  if (fields.includes("birthDate") && !draft.birthDate) {
    errors.birthDate = "Укажите дату рождения";
  }
  if (fields.includes("heightCm") && !(height >= HEIGHT_CM.min && height <= HEIGHT_CM.max)) {
    errors.heightCm = `Рост от ${HEIGHT_CM.min} до ${HEIGHT_CM.max} см`;
  }
  if (fields.includes("weightKg") && !(weight >= WEIGHT_KG.min && weight <= WEIGHT_KG.max)) {
    errors.weightKg = `Вес от ${WEIGHT_KG.min} до ${WEIGHT_KG.max} кг`;
  }
  if (fields.includes("activityLevel") && !draft.activityLevel) {
    errors.activityLevel = "Выберите уровень активности";
  }
  return errors;
}

/** Combines a fully validated draft with the goal settings into the API payload. */
export function toBodyData(
  draft: BodyDraft,
  goal: Pick<BodyData, "goal" | "deficitPercent" | "surplusPercent">,
): BodyData {
  return {
    sex: draft.sex!,
    birthDate: draft.birthDate,
    heightCm: Math.round(Number(draft.heightCm)),
    weightKg: Number(draft.weightKg),
    activityLevel: draft.activityLevel!,
    ...goal,
  };
}

type FieldProps = {
  draft: BodyDraft;
  update: (patch: Partial<BodyDraft>) => void;
  error?: string;
};

function FieldError({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function SexField({ draft, update, error }: FieldProps) {
  return (
    <div className="field-label">
      Пол
      <div className="segmented choice-segmented">
        {sexOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={draft.sex === option.value ? "active" : ""}
            onClick={() => update({ sex: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>
      <FieldError message={error} />
    </div>
  );
}

export function BirthDateField({ draft, update, error }: FieldProps) {
  return (
    <label className="field-label">
      Дата рождения
      <input
        className="field"
        type="date"
        value={draft.birthDate}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(event) => update({ birthDate: event.target.value })}
      />
      <FieldError message={error} />
    </label>
  );
}

export function HeightField({ draft, update, error }: FieldProps) {
  return (
    <label className="field-label">
      Рост, см
      <input
        className="field"
        inputMode="numeric"
        placeholder="175"
        value={draft.heightCm}
        onChange={(event) =>
          update({ heightCm: event.target.value.replace(/\D/g, "").slice(0, 3) })
        }
      />
      <FieldError message={error} />
    </label>
  );
}

export function WeightField({ draft, update, error }: FieldProps) {
  return (
    <label className="field-label">
      Вес, кг
      <AmountInput
        value={draft.weightKg}
        onChange={(weightKg) => update({ weightKg })}
        placeholder="72,5"
      />
      <FieldError message={error} />
    </label>
  );
}

export function ActivityField({ draft, update, error }: FieldProps) {
  return (
    <div className="field-label">
      Активность
      <div className="choice-list" role="radiogroup" aria-label="Активность">
        {activityOptions.map((option) => {
          const selected = draft.activityLevel === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={"choice " + (selected ? "selected" : "")}
              onClick={() => update({ activityLevel: option.value })}
            >
              <span className="choice-text">
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </span>
              {selected && <Check size={18} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <FieldError message={error} />
    </div>
  );
}

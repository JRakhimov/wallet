import { useState } from "react";
import { Sheet, SheetPresence } from "@ui/components/Sheet";
import { ThemeSelect } from "@ui/components/ThemeSelect";
import { Owner } from "@ui/lib/owner";
import {
  BodyData,
  DailyTargets,
  Goal,
  NutritionProfile,
  saveBodyData,
  useProfileUpdate,
} from "../api";
import {
  ActivityField,
  BirthDateField,
  BodyDraft,
  HeightField,
  SexField,
  toBodyData,
  useBodyDraft,
  validateBody,
  WeightField,
} from "../components/BodyFields";
import { TargetsPanel } from "../components/TargetsPanel";
import {
  activityLabel,
  deficitOptions,
  goalOptions,
  formatNumber,
  limitExplanation,
  sexLabel,
  surplusOptions,
} from "../lib/labels";

const TARGET_ROWS: { key: keyof DailyTargets; label: string; unit: string }[] = [
  { key: "kcal", label: "Калории", unit: "ккал" },
  { key: "proteinG", label: "Белки", unit: "г" },
  { key: "fatG", label: "Жиры", unit: "г" },
  { key: "carbsG", label: "Углеводы", unit: "г" },
];

const BODY_FIELDS: (keyof BodyDraft)[] = [
  "sex",
  "birthDate",
  "heightCm",
  "weightKg",
  "activityLevel",
];

type ProfileSheet = "targets" | "body" | null;

/** Body data and goal fields of a profile, as sent to PUT /nutrition/profile. */
function bodyData(profile: NutritionProfile): BodyData {
  const {
    sex,
    birthDate,
    heightCm,
    weightKg,
    activityLevel,
    goal,
    deficitPercent,
    surplusPercent,
  } = profile;
  return {
    sex,
    birthDate,
    heightCm,
    weightKg,
    activityLevel,
    goal,
    deficitPercent,
    surplusPercent,
  };
}

export function ProfilePage({ profile, owner }: { profile: NutritionProfile; owner: Owner }) {
  const updateProfile = useProfileUpdate();
  const [sheet, setSheet] = useState<ProfileSheet>(null);
  const [error, setError] = useState("");

  async function saveGoal(patch: Partial<BodyData>) {
    setError("");
    try {
      await updateProfile(() => saveBodyData({ ...bodyData(profile), ...patch }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить цель");
    }
  }

  const limit = limitExplanation(profile);
  const close = () => setSheet(null);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Профиль</h1>
        </div>
      </div>

      <section className="card">
        <h2 className="card-title">Цель</h2>
        <div className="segmented">
          {goalOptions.map((option) => (
            <button
              key={option.value}
              className={profile.goal === option.value ? "active" : ""}
              onClick={() => void saveGoal({ goal: option.value as Goal })}
            >
              {option.label}
            </button>
          ))}
        </div>
        {profile.goal === "lose" && (
          <PaceSelect
            label="Дефицит калорий"
            options={deficitOptions}
            value={profile.deficitPercent}
            onChange={(deficitPercent) => void saveGoal({ deficitPercent })}
          />
        )}
        {profile.goal === "gain" && (
          <PaceSelect
            label="Профицит калорий"
            options={surplusOptions}
            value={profile.surplusPercent}
            onChange={(surplusPercent) => void saveGoal({ surplusPercent })}
          />
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Нормы на день</h2>
        {TARGET_ROWS.map(({ key, label, unit }) => (
          <div key={key} className="info-row">
            <span>{label}</span>
            <span className="info-value">
              {profile.overridden[key] && <span className="tag">вручную</span>}
              {formatNumber(profile.targets[key])} {unit}
            </span>
          </div>
        ))}
        <p className="card-note">
          Расход: в покое {formatNumber(profile.bmr)} ккал, с активностью{" "}
          {formatNumber(profile.tdee)} ккал.
          {limit && ` ${limit}`}
        </p>
        <button className="secondary full" onClick={() => setSheet("targets")}>
          Изменить нормы
        </button>
      </section>

      <section className="card">
        <h2 className="card-title">Мои данные</h2>
        <div className="info-row">
          <span>Пол</span>
          <span className="info-value">{sexLabel(profile.sex)}</span>
        </div>
        <div className="info-row">
          <span>Возраст</span>
          <span className="info-value">{profile.age}</span>
        </div>
        <div className="info-row">
          <span>Рост</span>
          <span className="info-value">{profile.heightCm} см</span>
        </div>
        <div className="info-row">
          <span>Вес</span>
          <span className="info-value">{String(profile.weightKg).replace(".", ",")} кг</span>
        </div>
        <div className="info-row">
          <span>Активность</span>
          <span className="info-value">{activityLabel(profile.activityLevel)}</span>
        </div>
        <button className="secondary full" onClick={() => setSheet("body")}>
          Изменить данные
        </button>
      </section>

      <ThemeSelect value={owner.theme} onError={setError} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <SheetPresence>
        {sheet === "targets" && (
          <Sheet title="Нормы на день" onClose={close}>
            <TargetsPanel profile={profile} onDone={close} />
          </Sheet>
        )}
      </SheetPresence>
      <SheetPresence>
        {sheet === "body" && (
          <Sheet title="Мои данные" onClose={close}>
            <BodyPanel profile={profile} onDone={close} />
          </Sheet>
        )}
      </SheetPresence>
    </div>
  );
}

function PaceSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: number[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="pace">
      <span className="field-label">{label}</span>
      <div className="segmented pace-options">
        {options.map((option) => (
          <button
            key={option}
            className={value === option ? "active" : ""}
            onClick={() => onChange(option)}
          >
            {option}%
          </button>
        ))}
      </div>
    </div>
  );
}

/** Edits body data; the goal settings are kept as they are. */
function BodyPanel({ profile, onDone }: { profile: NutritionProfile; onDone: () => void }) {
  const updateProfile = useProfileUpdate();
  const { draft, update } = useBodyDraft(profile);
  const [errors, setErrors] = useState<Partial<Record<keyof BodyDraft, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const fieldErrors = validateBody(draft, BODY_FIELDS);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { goal, deficitPercent, surplusPercent } = profile;
      await updateProfile(() =>
        saveBodyData(toBodyData(draft, { goal, deficitPercent, surplusPercent })),
      );
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить данные");
    } finally {
      setBusy(false);
    }
  }

  const fieldProps = { draft, update };
  return (
    <div className="sheet-body">
      <SexField {...fieldProps} error={errors.sex} />
      <BirthDateField {...fieldProps} error={errors.birthDate} />
      <HeightField {...fieldProps} error={errors.heightCm} />
      <WeightField {...fieldProps} error={errors.weightKg} />
      <ActivityField {...fieldProps} error={errors.activityLevel} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy} onClick={() => void save()}>
        {busy ? "Сохраняем…" : "Сохранить"}
      </button>
    </div>
  );
}

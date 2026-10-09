import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Salad } from "lucide-react";
import { NutritionProfile, PROFILE_QUERY_KEY, saveBodyData } from "../api";
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
import { PlanSummary } from "../components/PlanSummary";

type Step = { title: string; hint: string; fields: (keyof BodyDraft)[] };

const STEPS: Step[] = [
  {
    title: "Немного о вас",
    hint: "Нужно для расчёта расхода калорий.",
    fields: ["sex", "birthDate"],
  },
  {
    title: "Рост и вес",
    hint: "Вес можно будет обновлять в профиле.",
    fields: ["heightCm", "weightKg"],
  },
  {
    title: "Активность",
    hint: "Выберите то, что ближе к обычной неделе.",
    fields: ["activityLevel"],
  },
];

// New profiles start with weight loss; the goal is changed later in the profile.
const DEFAULT_GOAL = { goal: "lose", deficitPercent: 20, surplusPercent: 10 } as const;

/** First launch: body data in three steps, then the calculated plan. */
export function Onboarding() {
  const queryClient = useQueryClient();
  const { draft, update } = useBodyDraft();
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<keyof BodyDraft, string>>>({});
  const [result, setResult] = useState<NutritionProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  async function next() {
    const stepErrors = validateBody(draft, step.fields);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length) {
      return;
    }
    if (!isLastStep) {
      setStepIndex(stepIndex + 1);
      return;
    }

    setBusy(true);
    setError("");
    try {
      setResult(await saveBodyData(toBodyData(draft, DEFAULT_GOAL)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить данные");
    } finally {
      setBusy(false);
    }
  }

  // The profile is already saved; putting it into the cache opens the main screens.
  function finish() {
    queryClient.setQueryData(PROFILE_QUERY_KEY, result);
  }

  if (result) {
    return (
      <div className="onboarding">
        <div className="onboarding-body">
          <h1>Ваш план</h1>
          <p className="onboarding-hint">
            Цель — похудение. Её и любые цифры можно изменить в профиле.
          </p>
          <PlanSummary profile={result} />
        </div>
        <div className="onboarding-actions">
          <button className="primary full" onClick={finish}>
            Начать
          </button>
        </div>
      </div>
    );
  }

  const fieldProps = { draft, update };
  return (
    <div className="onboarding">
      <div className="onboarding-top">
        {stepIndex > 0 ? (
          <button
            className="icon-btn"
            aria-label="Назад"
            onClick={() => setStepIndex(stepIndex - 1)}
          >
            <ArrowLeft size={20} />
          </button>
        ) : (
          <span className="brand-icon onboarding-logo">
            <Salad size={22} />
          </span>
        )}
        <div className="step-dots" aria-label={`Шаг ${stepIndex + 1} из ${STEPS.length}`}>
          {STEPS.map((item, index) => (
            <i key={item.title} className={index <= stepIndex ? "done" : ""} />
          ))}
        </div>
      </div>
      <div className="onboarding-body">
        <h1>{step.title}</h1>
        <p className="onboarding-hint">{step.hint}</p>
        {step.fields.includes("sex") && <SexField {...fieldProps} error={errors.sex} />}
        {step.fields.includes("birthDate") && (
          <BirthDateField {...fieldProps} error={errors.birthDate} />
        )}
        {step.fields.includes("heightCm") && (
          <HeightField {...fieldProps} error={errors.heightCm} />
        )}
        {step.fields.includes("weightKg") && (
          <WeightField {...fieldProps} error={errors.weightKg} />
        )}
        {step.fields.includes("activityLevel") && (
          <ActivityField {...fieldProps} error={errors.activityLevel} />
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="onboarding-actions">
        <button className="primary full" disabled={busy} onClick={() => void next()}>
          {busy ? "Считаем…" : isLastStep ? "Рассчитать" : "Далее"}
        </button>
      </div>
    </div>
  );
}

import { NutritionProfile } from "@prisma/client";
import {
  ActivityLevel,
  BodyProfile,
  carbsForRemainingKcal,
  DailyTargets,
  energyPlan,
  Goal,
  Sex,
} from "./energy";

type TargetOverrides = Record<keyof DailyTargets, number | null>;

export function toBodyProfile(row: NutritionProfile): BodyProfile {
  return {
    sex: row.sex as Sex,
    birthDate: row.birthDate,
    heightCm: row.heightCm,
    weightKg: row.weightKg.toNumber(),
    activityLevel: row.activityLevel as ActivityLevel,
    goal: row.goal as Goal,
    deficitPercent: row.deficitPercent,
    surplusPercent: row.surplusPercent,
  };
}

/**
 * Effective daily targets: manual values where set, calculated otherwise. Unless set
 * manually, carbohydrates fill whatever the effective calories leave after protein and fat,
 * so the four targets always add up.
 */
export function effectiveTargets(
  calculated: DailyTargets,
  overrides: TargetOverrides,
): DailyTargets {
  const kcal = overrides.kcal ?? calculated.kcal;
  const proteinG = overrides.proteinG ?? calculated.proteinG;
  const fatG = overrides.fatG ?? calculated.fatG;
  const carbsG = overrides.carbsG ?? carbsForRemainingKcal(kcal, proteinG, fatG);
  return { kcal, proteinG, fatG, carbsG };
}

/** Profile as the client sees it: inputs, calculated plan and effective targets. */
export function profileView(row: NutritionProfile, today: Date) {
  const body = toBodyProfile(row);
  const plan = energyPlan(body, today);
  const overrides: TargetOverrides = {
    kcal: row.kcalOverride,
    proteinG: row.proteinGOverride,
    fatG: row.fatGOverride,
    carbsG: row.carbsGOverride,
  };
  const targets = effectiveTargets(plan.targets, overrides);

  return {
    ...body,
    birthDate: row.birthDate.toISOString().slice(0, 10),
    age: plan.age,
    bmr: plan.bmr,
    tdee: plan.tdee,
    limitedBy: plan.limitedBy,
    calculated: plan.targets,
    targets,
    overridden: {
      kcal: overrides.kcal !== null,
      proteinG: overrides.proteinG !== null,
      fatG: overrides.fatG !== null,
      carbsG: overrides.carbsG !== null,
    },
  };
}

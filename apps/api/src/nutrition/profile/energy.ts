/**
 * Daily energy and macro targets. Pure functions: no I/O, easy to test.
 * Formulas and defaults are described in docs/nutrition-plan.md, section 2.
 */

export const SEXES = ["male", "female"] as const;
export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "high", "very_high"] as const;
export const GOALS = ["lose", "maintain", "gain"] as const;

export type Sex = (typeof SEXES)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type Goal = (typeof GOALS)[number];

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9,
};

/** Protein per kg of body weight: higher while losing weight to preserve muscle. */
const PROTEIN_G_PER_KG: Record<Goal, number> = { lose: 1.8, maintain: 1.6, gain: 1.8 };
const FAT_G_PER_KG = 0.9;

/** Lowest daily calories we recommend while losing weight. */
const MIN_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };

const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARBS = 4;
const KCAL_PER_G_FAT = 9;

export type BodyProfile = {
  sex: Sex;
  birthDate: Date;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  /** Calorie deficit for "lose", percent of TDEE. */
  deficitPercent: number;
  /** Calorie surplus for "gain", percent of TDEE. */
  surplusPercent: number;
};

export type DailyTargets = { kcal: number; proteinG: number; fatG: number; carbsG: number };

export type EnergyPlan = {
  age: number;
  /** Basal metabolic rate: calories burned per day at complete rest. */
  bmr: number;
  /** Total daily energy expenditure: BMR adjusted for activity. */
  tdee: number;
  targets: DailyTargets;
  /** Set when the goal's calories were raised to a safe floor. */
  limitedBy: "bmr" | "minimum" | null;
};

/** Full years between the birth date and `today` (both calendar dates). */
export function ageOn(birthDate: Date, today: Date) {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayPassed =
    today.getUTCMonth() > birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() &&
      today.getUTCDate() >= birthDate.getUTCDate());
  if (!birthdayPassed) {
    age--;
  }
  return age;
}

/** Mifflin–St Jeor equation. */
export function basalMetabolicRate(sex: Sex, weightKg: number, heightCm: number, age: number) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

/** Daily calories for the goal, never below a safe floor while losing weight. */
export function goalCalories(profile: BodyProfile, bmr: number, tdee: number) {
  if (profile.goal === "maintain") {
    return { kcal: tdee, limitedBy: null };
  }
  if (profile.goal === "gain") {
    return { kcal: tdee * (1 + profile.surplusPercent / 100), limitedBy: null };
  }

  const kcal = tdee * (1 - profile.deficitPercent / 100);
  const minimum = MIN_KCAL[profile.sex];
  const floor = Math.max(bmr, minimum);
  if (kcal >= floor) {
    return { kcal, limitedBy: null };
  }
  return { kcal: floor, limitedBy: bmr >= minimum ? ("bmr" as const) : ("minimum" as const) };
}

/** Carbohydrates that fill the calories left after protein and fat. */
export function carbsForRemainingKcal(kcal: number, proteinG: number, fatG: number) {
  const remainingKcal = kcal - proteinG * KCAL_PER_G_PROTEIN - fatG * KCAL_PER_G_FAT;
  return Math.max(0, Math.round(remainingKcal / KCAL_PER_G_CARBS));
}

/** Protein and fat from body weight; carbohydrates fill the remaining calories. */
export function macroTargets(goal: Goal, weightKg: number, kcal: number) {
  const proteinG = Math.round(PROTEIN_G_PER_KG[goal] * weightKg);
  const fatG = Math.round(FAT_G_PER_KG * weightKg);
  return { proteinG, fatG, carbsG: carbsForRemainingKcal(kcal, proteinG, fatG) };
}

export function energyPlan(profile: BodyProfile, today: Date): EnergyPlan {
  const age = ageOn(profile.birthDate, today);
  const bmr = basalMetabolicRate(profile.sex, profile.weightKg, profile.heightCm, age);
  const tdee = bmr * ACTIVITY_FACTORS[profile.activityLevel];
  const { kcal, limitedBy } = goalCalories(profile, bmr, tdee);
  const roundedKcal = Math.round(kcal);

  return {
    age,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targets: { kcal: roundedKcal, ...macroTargets(profile.goal, profile.weightKg, roundedKcal) },
    limitedBy,
  };
}

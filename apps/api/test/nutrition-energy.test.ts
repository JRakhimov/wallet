import assert from "node:assert/strict";
import { test } from "node:test";
import { ageOn, BodyProfile, energyPlan } from "../src/nutrition/profile/energy";
import { effectiveTargets } from "../src/nutrition/profile/profile.view";

const today = new Date("2026-06-01");

// 30 years, 80 kg, 180 cm. BMR = 10·80 + 6.25·180 − 5·30 + 5 = 1780.
const man: BodyProfile = {
  sex: "male",
  birthDate: new Date("1996-01-01"),
  heightCm: 180,
  weightKg: 80,
  activityLevel: "moderate",
  goal: "lose",
  deficitPercent: 20,
  surplusPercent: 10,
};

test("age counts full years and respects the birthday", () => {
  assert.equal(ageOn(new Date("2000-06-15"), new Date("2026-06-14")), 25);
  assert.equal(ageOn(new Date("2000-06-15"), new Date("2026-06-15")), 26);
});

test("weight loss: BMR, TDEE, deficit and macros", () => {
  const plan = energyPlan(man, today);
  assert.equal(plan.age, 30);
  assert.equal(plan.bmr, 1780);
  assert.equal(plan.tdee, 2759); // 1780 × 1.55
  // 2759 × 0.8 = 2207; protein 1.8 g/kg, fat 0.9 g/kg, carbs = (2207 − 144·4 − 72·9) / 4
  assert.deepEqual(plan.targets, { kcal: 2207, proteinG: 144, fatG: 72, carbsG: 246 });
  assert.equal(plan.limitedBy, null);
});

test("maintenance and weight gain", () => {
  const maintain = energyPlan({ ...man, goal: "maintain" }, today);
  assert.equal(maintain.targets.kcal, 2759);
  assert.equal(maintain.targets.proteinG, 128); // 1.6 g/kg

  const gain = energyPlan({ ...man, goal: "gain" }, today);
  assert.equal(gain.targets.kcal, 3035); // 2759 × 1.1
});

test("deficit never goes below BMR", () => {
  // Sedentary: TDEE 2136, −20% = 1709 < BMR 1780.
  const plan = energyPlan({ ...man, activityLevel: "sedentary" }, today);
  assert.equal(plan.targets.kcal, 1780);
  assert.equal(plan.limitedBy, "bmr");
});

test("deficit never goes below the minimum for the sex", () => {
  // 40 years, 45 kg, 150 cm: BMR = 450 + 937.5 − 200 − 161 = 1026.5 < 1200.
  const plan = energyPlan(
    {
      ...man,
      sex: "female",
      birthDate: new Date("1986-01-01"),
      heightCm: 150,
      weightKg: 45,
      activityLevel: "sedentary",
    },
    today,
  );
  assert.equal(plan.targets.kcal, 1200);
  assert.equal(plan.limitedBy, "minimum");
});

test("manual calories re-balance carbs unless carbs are set manually", () => {
  const calculated = { kcal: 2759, proteinG: 128, fatG: 72, carbsG: 400 };
  const none = { kcal: null, proteinG: null, fatG: null, carbsG: null };

  assert.deepEqual(effectiveTargets(calculated, none), calculated);
  // 2000 − 160·4 − 72·9 = 712 kcal → 178 g carbs.
  assert.deepEqual(effectiveTargets(calculated, { ...none, kcal: 2000, proteinG: 160 }), {
    kcal: 2000,
    proteinG: 160,
    fatG: 72,
    carbsG: 178,
  });
  assert.equal(effectiveTargets(calculated, { ...none, kcal: 2000, carbsG: 250 }).carbsG, 250);
});

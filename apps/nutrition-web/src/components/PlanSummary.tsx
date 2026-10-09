import { NutritionProfile } from "../api";
import { formatNumber, limitExplanation } from "../lib/labels";

/** Energy expenditure and daily targets, shown after onboarding and in the profile. */
export function PlanSummary({ profile }: { profile: NutritionProfile }) {
  const limit = limitExplanation(profile);

  return (
    <div className="plan-summary">
      <div className="plan-energy">
        <div>
          <span>В покое</span>
          <strong>{formatNumber(profile.bmr)}</strong>
          <small>ккал в день</small>
        </div>
        <div>
          <span>С активностью</span>
          <strong>{formatNumber(profile.tdee)}</strong>
          <small>ккал в день</small>
        </div>
      </div>
      <div className="plan-target">
        <span>Норма на день</span>
        <strong>
          {formatNumber(profile.targets.kcal)} <small>ккал</small>
        </strong>
        <div className="plan-macros">
          <span>Белки {profile.targets.proteinG} г</span>
          <span>Жиры {profile.targets.fatG} г</span>
          <span>Углеводы {profile.targets.carbsG} г</span>
        </div>
      </div>
      {limit && <p className="sheet-desc">{limit}</p>}
    </div>
  );
}

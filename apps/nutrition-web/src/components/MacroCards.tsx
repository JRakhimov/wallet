import { Droplet, Ham, Wheat } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DailyTargets } from "../api";

type Macros = Pick<DailyTargets, "proteinG" | "fatG" | "carbsG">;

const MACROS: { key: keyof Macros; Icon: LucideIcon; remainingLabel: string }[] = [
  { key: "proteinG", Icon: Ham, remainingLabel: "Осталось белков" },
  { key: "carbsG", Icon: Wheat, remainingLabel: "Осталось углеводов" },
  { key: "fatG", Icon: Droplet, remainingLabel: "Осталось жиров" },
];

/** Grams of protein, carbs and fat left for today, one card each in a row. */
export function MacroCards({ eaten, targets }: { eaten: Macros; targets: Macros }) {
  return (
    <div className="macro-cards">
      {MACROS.map(({ key, Icon, remainingLabel }) => {
        const target = targets[key];
        const remaining = Math.round(target - eaten[key]);
        const over = remaining < 0;
        const percent = target > 0 ? Math.min(100, (eaten[key] / target) * 100) : 0;
        return (
          <div key={key} className={"macro-card" + (over ? " over" : "")}>
            <div className="macro-amount">
              <Icon size={20} aria-hidden="true" />
              <strong>{Math.abs(remaining)} г</strong>
            </div>
            <span className="macro-label">{over ? "Сверх нормы" : remainingLabel}</span>
            <div className="macro-track" aria-hidden="true">
              <i style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

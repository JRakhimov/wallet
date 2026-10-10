import { ChevronLeft } from "lucide-react";
import { useTelegramBack } from "@ui/lib/useTelegramBack";
import { MACRO_INFO, MacroKey } from "../macroInfo";

export function MacroInfoPage({
  macro,
  eaten,
  target,
  onBack,
}: {
  macro: MacroKey;
  /** Grams eaten today. */
  eaten: number;
  /** Daily target in grams. */
  target: number;
  onBack: () => void;
}) {
  useTelegramBack(onBack);

  const { title, Icon, lead, kcalPerGram, roles, types, sources, tips } = MACRO_INFO[macro];
  const percent = target > 0 ? Math.min(100, (eaten / target) * 100) : 0;
  const maxSourceGrams = Math.max(...sources.map((source) => source.grams));
  const sortedSources = [...sources].sort((a, b) => b.grams - a.grams);

  return (
    <div className="page macro-info">
      <div className="page-heading macro-info-heading">
        <button type="button" className="icon-btn" aria-label="Назад" onClick={onBack}>
          <ChevronLeft size={22} />
        </button>
        <h1>{title}</h1>
      </div>

      <section className="card macro-info-summary">
        <div className="macro-info-today">
          <Icon size={22} aria-hidden="true" />
          <strong>
            {Math.round(eaten)} из {Math.round(target)} г
          </strong>
          <span>сегодня</span>
        </div>
        <div className="macro-track" aria-hidden="true">
          <i style={{ width: `${percent}%` }} />
        </div>
        <p className="card-note">{lead}</p>
        <p className="card-note">В 1 г — {kcalPerGram} ккал.</p>
      </section>

      <h2 className="section-title">Зачем нужны</h2>
      <ul className="card macro-info-list">
        {roles.map((role) => (
          <li key={role}>{role}</li>
        ))}
      </ul>

      <h2 className="section-title">Какие бывают</h2>
      <div className="macro-info-types">
        {types.map((type) => (
          <div key={type.name} className="card">
            <strong>{type.name}</strong>
            <p className="card-note">{type.description}</p>
          </div>
        ))}
      </div>

      <h2 className="section-title">Где больше всего</h2>
      <section className="card">
        <p className="card-note">Граммы на 100 г продукта.</p>
        <ul className="macro-source-list">
          {sortedSources.map((source) => (
            <li key={source.name} className="macro-source">
              <div className="macro-source-row">
                <span>{source.name}</span>
                <strong>{source.grams} г</strong>
              </div>
              <div className="macro-track" aria-hidden="true">
                <i style={{ width: `${(source.grams / maxSourceGrams) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <h2 className="section-title">Советы</h2>
      <ul className="card macro-info-list">
        {tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </div>
  );
}

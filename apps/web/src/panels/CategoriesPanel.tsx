import { useState } from "react";
import { Star } from "lucide-react";
import { Category, request } from "../api";
import { CategoryIcon } from "../components/CategoryIcon";
import { IconSelect } from "../components/IconSelect";
import { SelectField } from "../components/SelectField";
import { categoryKindChoices } from "../lib/choices";

export function CategoriesPanel({
  categories,
  onRefresh,
}: {
  categories: Category[];
  onRefresh: () => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [iconName, setIconName] = useState("shapes");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("shapes");
  async function create() {
    setBusy(true);
    setError("");
    try {
      await request("/categories", {
        method: "POST",
        body: JSON.stringify({ name, kind, icon: iconName }),
      });
      setName("");
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать категорию");
    } finally {
      setBusy(false);
    }
  }
  async function archive(c: Category) {
    setBusy(true);
    setError("");
    try {
      await request("/categories/" + c.id, {
        method: "PATCH",
        body: JSON.stringify({ archived: !c.archived }),
      });
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить категорию");
    } finally {
      setBusy(false);
    }
  }
  async function update(c: Category, patch: { favorite?: boolean; name?: string; icon?: string }) {
    setBusy(true);
    setError("");
    try {
      await request("/categories/" + c.id, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setEditing(null);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить категорию");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sheet-body">
      <div className="sheet-list">
        {categories.map((c) => (
          <div className="manage-row" key={c.id}>
            <CategoryIcon name={c.icon} />
            <span className="manage-text">
              <strong>{c.name}</strong>
              <small>{c.archived ? "В архиве" : c.kind === "expense" ? "Расход" : "Доход"}</small>
            </span>
            <button
              className="star-button"
              aria-label={c.favorite ? "Убрать из избранного" : "В избранное"}
              disabled={busy}
              onClick={() => void update(c, { favorite: !c.favorite })}
            >
              <Star size={17} fill={c.favorite ? "currentColor" : "none"} />
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setEditing(c.id);
                setEditName(c.name);
                setEditIcon(c.icon);
              }}
            >
              Править
            </button>
            <button className="text-button" disabled={busy} onClick={() => void archive(c)}>
              {c.archived ? "Вернуть" : "Архив"}
            </button>
          </div>
        ))}
      </div>
      {editing && (
        <div className="inline-edit">
          <label className="field-label">
            Название категории
            <input
              className="field"
              maxLength={50}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </label>
          <IconSelect value={editIcon} onChange={setEditIcon} disabled={busy} />
          <button
            className="secondary full"
            disabled={busy || !editName.trim()}
            onClick={() =>
              void update(
                categories.find((c) => c.id === editing)!,
                { name: editName, icon: editIcon },
              )
            }
          >
            Сохранить изменения
          </button>
        </div>
      )}
      <h3 className="sheet-subtitle">Новая категория</h3>
      <label className="field-label">
        Название
        <input
          className="field"
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, спорт"
        />
      </label>
      <SelectField
        label="Для"
        value={kind}
        options={categoryKindChoices}
        onChange={(value) => setKind(value as "expense" | "income")}
      />
      <IconSelect value={iconName} onChange={setIconName} disabled={busy} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary full"
        disabled={!name.trim() || busy}
        onClick={() => void create()}
      >
        {busy ? "Сохраняем…" : "Создать категорию"}
      </button>
    </div>
  );
}

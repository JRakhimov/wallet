import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Account } from "../api";
import { request } from "@ui/lib/api-client";
import { SelectField } from "@ui/components/SelectField";
import { accountKindChoices } from "../lib/choices";
import { money, normalizeAmount } from "@ui/lib/format";
import { AmountInput } from "@ui/components/AmountInput";

export function AccountsPanel({
  accounts,
  refresh,
}: {
  accounts: Account[];
  refresh: () => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("card");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      await request("/accounts", {
        method: "POST",
        body: JSON.stringify({
          name,
          kind,
          openingBalance: normalizeAmount(openingBalance) || "0",
        }),
      });
      setName("");
      setOpeningBalance("0");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать счёт");
    } finally {
      setBusy(false);
    }
  }
  async function archive(account: Account) {
    setBusy(true);
    setError("");
    try {
      await request("/accounts/" + account.id, {
        method: "PATCH",
        body: JSON.stringify({ archived: !account.archived }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить счёт");
    } finally {
      setBusy(false);
    }
  }
  async function rename() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await request("/accounts/" + editing, {
        method: "PATCH",
        body: JSON.stringify({ name: editName }),
      });
      setEditing(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось переименовать счёт");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sheet-body">
      <div className="sheet-list">
        {accounts.map((a) => (
          <div className="manage-row" key={a.id}>
            <span className="manage-icon">
              <CreditCard size={19} />
            </span>
            <span className="manage-text">
              <strong>{a.name}</strong>
              <small>{a.archived ? "В архиве" : money(a.balance) + " сум"}</small>
            </span>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setEditing(a.id);
                setEditName(a.name);
              }}
            >
              Имя
            </button>
            <button className="text-button" disabled={busy} onClick={() => void archive(a)}>
              {a.archived ? "Вернуть" : "Архив"}
            </button>
          </div>
        ))}
      </div>
      {editing && (
        <div className="inline-edit">
          <label className="field-label">
            Название счёта
            <input
              className="field"
              maxLength={50}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </label>
          <button
            className="secondary full"
            disabled={busy || !editName.trim()}
            onClick={() => void rename()}
          >
            Сохранить название
          </button>
        </div>
      )}
      <h3 className="sheet-subtitle">Новый счёт</h3>
      <label className="field-label">
        Название
        <input
          className="field"
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, наличные"
        />
      </label>
      <SelectField label="Тип" value={kind} options={accountKindChoices} onChange={setKind} />
      <label className="field-label">
        Начальный остаток, сум
        <AmountInput value={openingBalance} onChange={setOpeningBalance} allowNegative />
      </label>
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
        {busy ? "Сохраняем…" : "Создать счёт"}
      </button>
    </div>
  );
}

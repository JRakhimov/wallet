import { useEffect, useState } from "react";
import { request } from "../api";
import { monthLabel, normalizeAmount } from "../lib/format";
import { AmountInput } from "../components/AmountInput";

export function BudgetPanel({
  month,
  amount,
  refresh,
}: {
  month: string;
  amount: string | null;
  refresh: () => Promise<unknown>;
}) {
  const [value, setValue] = useState(amount || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(amount || ""), [month, amount]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await request("/budgets/" + month, {
        method: "PUT",
        body: JSON.stringify({ amount: normalizeAmount(value) }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить бюджет");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sheet-body">
      <p className="sheet-desc">Общий лимит на {monthLabel(month)}.</p>
      <label className="field-label">
        Лимит, сум
        <AmountInput value={value} onChange={setValue} placeholder="Например, 6 000 000" />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={!value.trim() || busy} onClick={() => void save()}>
        {busy ? "Сохраняем…" : "Сохранить бюджет"}
      </button>
    </div>
  );
}

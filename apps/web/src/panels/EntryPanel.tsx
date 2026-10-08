import { useRef, useState } from "react";
import { Account, Category, OperationInput, request } from "../api";
import { SelectField } from "../components/SelectField";
import { accountChoices, categoryChoices } from "../lib/choices";
import {
  centsToAmount,
  money,
  normalizeAmount,
  occurrenceForDay,
  parseCents,
  today,
} from "../lib/format";

export function EntryPanel({
  type,
  accounts,
  categories,
  timezone,
  onDone,
}: {
  type: "income" | "transfer" | "adjustment";
  accounts: Account[];
  categories: Category[];
  timezone: string;
  onDone: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState(accounts[0]?.id || "");
  const [target, setTarget] = useState(accounts[1]?.id || "");
  const [category, setCategory] = useState(
    categories.find((c) => c.kind === "income" && !c.archived)?.id || "",
  );
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const attempt = useRef<{ key: string; body: OperationInput } | null>(null);
  const reset = () => {
    attempt.current = null;
    setError("");
  };
  const currentCents = parseCents(accounts.find((a) => a.id === source)?.balance || "0") || 0;
  const enteredCents = parseCents(amount);
  const difference = enteredCents === null ? null : enteredCents - currentCents;
  const canSave =
    type === "adjustment"
      ? difference !== null && difference !== 0 && Math.abs(difference) < 100_000_000_000_000
      : enteredCents !== null && enteredCents > 0;
  async function save() {
    setBusy(true);
    setError("");
    const body: OperationInput = {
      kind: type,
      amount: type === "adjustment" ? centsToAmount(difference || 0) : normalizeAmount(amount),
      accountId: source,
      note,
      occurredAt: occurrenceForDay(date, timezone),
    };
    if (type === "transfer") body.targetAccountId = target;
    if (type === "income") body.categoryId = category;
    if (type === "adjustment") body.direction = (difference || 0) > 0 ? "in" : "out";
    const submission = attempt.current || { key: crypto.randomUUID(), body };
    attempt.current = submission;
    try {
      await request("/transactions", {
        method: "POST",
        key: submission.key,
        body: JSON.stringify(submission.body),
      });
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить операцию");
    } finally {
      setBusy(false);
    }
  }
  const activeIncome = categories.filter((c) => c.kind === "income" && !c.archived);
  return (
    <div className="sheet-body">
      <SelectField
        label={type === "transfer" ? "Со счёта" : "Счёт"}
        value={source}
        options={accountChoices(accounts)}
        onChange={(value) => {
          setSource(value);
          reset();
        }}
      />
      {type === "adjustment" && (
        <p className="sheet-desc">
          По учёту сейчас {money(currentCents / 100)} сум. Введите фактический остаток, разница
          запишется отдельной операцией.
        </p>
      )}
      <label className="field-label">
        {type === "adjustment" ? "Фактический остаток, сум" : "Сумма, сум"}
        <input
          className="field"
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            reset();
          }}
          placeholder="0"
        />
      </label>
      {type === "adjustment" && difference !== null && difference !== 0 && (
        <p className="sheet-desc">
          Корректировка: {difference > 0 ? "+" : "−"}
          {money(Math.abs(difference) / 100)} сум
        </p>
      )}
      {type === "transfer" && (
        <SelectField
          label="На счёт"
          value={target}
          options={accountChoices(accounts)}
          onChange={(value) => {
            setTarget(value);
            reset();
          }}
        />
      )}
      {type === "income" && (
        <SelectField
          label="Категория"
          value={category}
          options={categoryChoices(activeIncome)}
          onChange={(value) => {
            setCategory(value);
            reset();
          }}
        />
      )}
      <label className="field-label">
        Дата
        <input
          className="field"
          type="date"
          max={today()}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            reset();
          }}
        />
      </label>
      <label className="field-label">
        Заметка
        <input
          className="field"
          maxLength={500}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            reset();
          }}
          placeholder="Необязательно"
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary full"
        disabled={busy || !canSave || (type === "transfer" && (!target || target === source))}
        onClick={() => void save()}
      >
        {busy
          ? "Сохраняем…"
          : type === "income"
            ? "Записать доход"
            : type === "transfer"
              ? "Перевести"
              : "Сохранить корректировку"}
      </button>
    </div>
  );
}

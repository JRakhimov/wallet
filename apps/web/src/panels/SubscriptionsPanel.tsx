import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { AmountInput } from "@ui/components/AmountInput";
import { SelectChoice, SelectField } from "@ui/components/SelectField";
import { request } from "@ui/lib/api-client";
import { money, normalizeAmount, parseCents } from "@ui/lib/format";
import { Subscription } from "../api";
import { monthlyTotal } from "../lib/subscriptions";

const DAYS_IN_MONTH = 31;
const CHARGE_DAYS: SelectChoice[] = Array.from({ length: DAYS_IN_MONTH }, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1}-е число`,
}));
const FIRST_SHORT_MONTH_DAY = 29;

function whenLabel(subscription: Subscription) {
  const date = DateTime.fromISO(subscription.nextChargeDate).setLocale("ru").toFormat("d MMMM");
  const { daysLeft } = subscription;

  if (daysLeft === 0) {
    return `Сегодня, ${date}`;
  }

  return daysLeft === 1 ? `Завтра, ${date}` : `${date}, через ${daysLeft} дн.`;
}

export function SubscriptionsPanel() {
  const queryClient = useQueryClient();
  const subscriptionsQ = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => request<Subscription[]>("/subscriptions"),
  });

  // `editing` is the subscription being changed; null means the form adds a new one.
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [chargeDay, setChargeDay] = useState("1");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const subscriptions = subscriptionsQ.data ?? [];
  const canSave = name.trim() !== "" && parseCents(amount) !== null && !busy;

  function resetForm() {
    setEditing(null);
    setName("");
    setAmount("");
    setChargeDay("1");
    setConfirmDelete(false);
    setError("");
  }

  function startEditing(subscription: Subscription) {
    setEditing(subscription);
    setName(subscription.name);
    setAmount(subscription.amount.replace(/\.00$/, ""));
    setChargeDay(String(subscription.chargeDay));
    setConfirmDelete(false);
    setError("");
  }

  async function run(work: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setError("");

    try {
      await work();
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : failure);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const body = JSON.stringify({
      name,
      amount: normalizeAmount(amount),
      chargeDay: Number(chargeDay),
    });

    return run(
      () =>
        request(editing ? `/subscriptions/${editing.id}` : "/subscriptions", {
          method: editing ? "PATCH" : "POST",
          body,
        }),
      "Не удалось сохранить подписку",
    );
  }

  function remove() {
    return run(
      () => request(`/subscriptions/${editing!.id}`, { method: "DELETE" }),
      "Не удалось удалить подписку",
    );
  }

  return (
    <div className="sheet-body">
      {subscriptions.length > 0 && (
        <p className="sheet-desc">
          Всего в месяц: <strong>{money(monthlyTotal(subscriptions))} сум</strong>
        </p>
      )}

      {subscriptionsQ.isLoading && <p className="sheet-desc">Загружаем…</p>}
      {subscriptionsQ.isSuccess && subscriptions.length === 0 && (
        <p className="sheet-desc">
          Подписок пока нет. Добавьте, и бот напомнит о списании за день и утром в день платежа.
        </p>
      )}

      <div className="sheet-list">
        {subscriptions.map((subscription) => (
          <div className="manage-row" key={subscription.id}>
            <span className="manage-text">
              <strong>{subscription.name}</strong>
              <small>{whenLabel(subscription)}</small>
            </span>
            <span className="subscription-amount">{money(subscription.amount)} сум</span>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => startEditing(subscription)}
            >
              Править
            </button>
          </div>
        ))}
      </div>

      <h3 className="sheet-subtitle">{editing ? "Изменить подписку" : "Новая подписка"}</h3>

      <label className="field-label">
        Название
        <input
          className="field"
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, Netflix"
        />
      </label>

      <label className="field-label">
        Сумма, сум
        <AmountInput value={amount} onChange={setAmount} placeholder="Например, 50 000" />
      </label>

      <SelectField
        label="День списания каждый месяц"
        value={chargeDay}
        options={CHARGE_DAYS}
        onChange={setChargeDay}
      />
      {Number(chargeDay) >= FIRST_SHORT_MONTH_DAY && (
        <p className="sheet-desc">В коротких месяцах спишется в последний день месяца.</p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button className="primary full" disabled={!canSave} onClick={() => void save()}>
        {busy ? "Сохраняем…" : editing ? "Сохранить изменения" : "Добавить подписку"}
      </button>

      {editing && (
        <>
          <button className="secondary full" disabled={busy} onClick={resetForm}>
            Отмена
          </button>
          <button
            className="danger-link"
            disabled={busy}
            onClick={() => (confirmDelete ? void remove() : setConfirmDelete(true))}
          >
            {confirmDelete ? "Точно удалить подписку?" : "Удалить подписку"}
          </button>
        </>
      )}
    </div>
  );
}

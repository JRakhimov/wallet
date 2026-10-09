import { useRef, useState } from "react";
import { DateTime } from "luxon";
import { Account, Category, Operation, OperationInput } from "../api";
import { request } from "@ui/lib/api-client";
import { SelectField } from "@ui/components/SelectField";
import { accountChoices, categoryChoices } from "../lib/choices";
import { money, normalizeAmount, occurrenceForDay, today } from "@ui/lib/format";
import { AmountInput } from "@ui/components/AmountInput";

export function OperationPanel({
  operation,
  accounts,
  categories,
  timezone,
  onDone,
  onRefresh,
}: {
  operation: Operation;
  accounts: Account[];
  categories: Category[];
  timezone: string;
  onDone: () => Promise<void>;
  onRefresh: () => Promise<unknown>;
}) {
  const [op, setOp] = useState(operation);
  const [edit, setEdit] = useState(false);
  const [amount, setAmount] = useState(operation.amount);
  const [account, setAccount] = useState(
    (operation.kind === "transfer"
      ? operation.entries.find((e) => e.amount.startsWith("-"))
      : operation.entries[0]
    )?.accountId || "",
  );
  const [target, setTarget] = useState(
    operation.entries.find((e) => !e.amount.startsWith("-"))?.accountId || "",
  );
  const [category, setCategory] = useState(operation.category?.id || "");
  const [note, setNote] = useState(operation.note);
  const [date, setDate] = useState(operation.localDate);
  const [refundAmount, setRefundAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const repeatAttempt = useRef<{ key: string; body: OperationInput } | null>(null);
  const refundAttempt = useRef<{ key: string; body: OperationInput } | null>(null);
  const editable = ["expense", "income", "transfer", "adjustment", "refund"].includes(op.kind);
  const maxRefund = Number(op.amount) - Number(op.refunded);
  async function send(method: string, path: string, body: unknown, key?: string) {
    setBusy(true);
    setError("");
    try {
      const updated = await request<Operation>(path, {
        method,
        key,
        body: JSON.stringify(body),
      });
      setOp(updated);
      setEdit(false);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить операцию");
    } finally {
      setBusy(false);
    }
  }
  function saveEdit() {
    const input: OperationInput = {
      kind: op.kind as OperationInput["kind"],
      amount: normalizeAmount(amount),
      accountId: account,
      note,
      occurredAt: occurrenceForDay(date, timezone),
    };
    if (op.kind === "expense" || op.kind === "income") input.categoryId = category;
    if (op.kind === "transfer") input.targetAccountId = target;
    if (op.kind === "adjustment")
      input.direction = op.entries[0]?.amount.startsWith("-") ? "out" : "in";
    if (op.kind === "refund") input.parentId = op.parentId || undefined;
    void send("PATCH", "/transactions/" + op.id, {
      ...input,
      version: op.version,
    });
  }
  function repeatOperation() {
    const input: OperationInput = {
      kind: op.kind as OperationInput["kind"],
      amount: op.amount,
      accountId:
        (op.kind === "transfer" ? op.entries.find((e) => e.amount.startsWith("-")) : op.entries[0])
          ?.accountId || "",
      note: op.note,
      occurredAt: new Date().toISOString(),
    };
    if (op.kind === "expense" || op.kind === "income") input.categoryId = op.category?.id;
    if (op.kind === "transfer")
      input.targetAccountId = op.entries.find((e) => !e.amount.startsWith("-"))?.accountId;
    const attempt = repeatAttempt.current || {
      key: crypto.randomUUID(),
      body: input,
    };
    repeatAttempt.current = attempt;
    void send("POST", "/transactions", attempt.body, attempt.key);
  }
  function refundOperation() {
    const input: OperationInput = {
      kind: "refund",
      amount: normalizeAmount(refundAmount),
      accountId: op.entries[0]?.accountId,
      parentId: op.id,
      note: "Возврат",
      occurredAt: new Date().toISOString(),
    };
    const attempt = refundAttempt.current || {
      key: crypto.randomUUID(),
      body: input,
    };
    refundAttempt.current = attempt;
    void send("POST", "/transactions", attempt.body, attempt.key);
  }
  async function toggleDeleted() {
    setBusy(true);
    setError("");
    try {
      const updated = await request<Operation>(
        "/transactions/" + op.id + (op.deleted ? "/restore" : ""),
        {
          method: op.deleted ? "POST" : "DELETE",
          body: JSON.stringify({ version: op.version }),
        },
      );
      setOp(updated);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить операцию");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sheet-body">
      <div className="operation-detail">
        <span>
          {op.kind === "refund"
            ? `Возврат · ${op.category?.name || "покупка"}`
            : op.category?.name || op.kind}
        </span>
        <strong>{money(op.amount)} сум</strong>
        <small>
          {DateTime.fromISO(op.occurredAt)
            .setZone(timezone)
            .setLocale("ru")
            .toFormat("d MMMM yyyy · HH:mm")}
        </small>
        <small>
          {(op.kind === "transfer"
            ? [...op.entries].sort(
                (a, b) => Number(b.amount.startsWith("-")) - Number(a.amount.startsWith("-")),
              )
            : op.entries
          )
            .map((e) => e.accountName)
            .join(" → ")}
        </small>
        {op.note && <p>{op.note}</p>}
      </div>
      {edit && (
        <div className="edit-form">
          <label className="field-label">
            Сумма
            <AmountInput value={amount} onChange={setAmount} />
          </label>
          <SelectField
            label="Счёт"
            value={account}
            options={accountChoices(accounts)}
            onChange={setAccount}
          />
          {op.kind === "transfer" && (
            <SelectField
              label="На счёт"
              value={target}
              options={accountChoices(accounts)}
              onChange={setTarget}
            />
          )}
          {["expense", "income"].includes(op.kind) && (
            <SelectField
              label="Категория"
              value={category}
              options={categoryChoices(categories.filter((c) => !c.archived && c.kind === op.kind))}
              onChange={setCategory}
            />
          )}
          <label className="field-label">
            Дата
            <input
              className="field"
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field-label">
            Заметка
            <input
              className="field"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            className="primary full"
            disabled={busy || !(Number(normalizeAmount(amount)) > 0)}
            onClick={saveEdit}
          >
            Сохранить изменения
          </button>
        </div>
      )}
      {!edit && editable && !op.deleted && (
        <button className="secondary full" disabled={busy} onClick={() => setEdit(true)}>
          Изменить
        </button>
      )}
      {!edit && !op.deleted && ["expense", "income", "transfer"].includes(op.kind) && (
        <button className="secondary full" disabled={busy} onClick={repeatOperation}>
          Повторить операцию
        </button>
      )}
      {op.kind === "expense" && !op.deleted && maxRefund > 0 && !edit && (
        <div className="refund-box">
          <label className="field-label">
            Возврат, не больше {money(maxRefund)} сум
            <AmountInput
              value={refundAmount}
              onChange={(value) => {
                setRefundAmount(value);
                refundAttempt.current = null;
              }}
              placeholder="Сумма возврата"
            />
          </label>
          <button
            className="secondary full"
            disabled={busy || !(Number(normalizeAmount(refundAmount)) > 0)}
            onClick={refundOperation}
          >
            Записать возврат
          </button>
        </div>
      )}
      <button className="danger-link" disabled={busy} onClick={() => void toggleDeleted()}>
        {op.deleted ? "Восстановить операцию" : "Удалить операцию"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

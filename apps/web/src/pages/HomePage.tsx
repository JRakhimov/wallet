import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronDown, Delete, MessageSquareText, Shapes, X } from "lucide-react";
import { DateTime } from "luxon";
import { Account, Category, Operation, OperationInput, Summary } from "../api";
import { Owner } from "@ui/lib/owner";
import { request } from "@ui/lib/api-client";
import { CategoryIcon } from "../components/CategoryIcon";
import { SelectField } from "@ui/components/SelectField";
import { Sheet, SheetPresence } from "@ui/components/Sheet";
import { accountChoices } from "../lib/choices";
import {
  currencyUnit,
  formatMoney,
  money,
  monthLabel,
  occurrenceForDay,
  today,
} from "@ui/lib/format";
import { amountFromKeys, amountLabel } from "../lib/keypad";
import { useRefresh } from "../lib/useRefresh";
import { ExpenseDraft } from "./useExpenseDraft";

type HomeSheet = "category" | "details" | "note" | null;
const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "decimal", "0", "backspace"];

export function HomePage({
  draft,
  owner,
  accounts,
  categories,
  summary,
  month,
  setFeedback,
  onOpenBudget,
}: {
  draft: ExpenseDraft;
  owner: Owner;
  accounts: Account[];
  categories: Category[];
  summary: Summary;
  month: string;
  setFeedback: (message: string) => void;
  onOpenBudget: () => void;
}) {
  const {
    amount,
    setAmount,
    categoryId,
    setCategoryId,
    accountId,
    setAccountId,
    note,
    setNote,
    day,
    setDay,
    attempt,
    setAttempt,
  } = draft;
  const [sheet, setSheet] = useState<HomeSheet>(null);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const refresh = useRefresh();
  const telegram = window.Telegram?.WebApp;
  const activeAccounts = accounts.filter((a) => !a.archived);
  const activeCategories = categories
    .filter((c) => !c.archived && c.kind === "expense")
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.position - b.position);
  const selectedCategory = activeCategories.find((c) => c.id === categoryId);
  const selectedAccount = activeAccounts.find((a) => a.id === accountId) || activeAccounts[0];
  useEffect(() => {
    if (activeAccounts.length && !activeAccounts.some((a) => a.id === accountId))
      setAccountId(activeAccounts[0].id);
  }, [accounts]);
  useEffect(() => {
    if (categoryId && !activeCategories.some((c) => c.id === categoryId)) setCategoryId("");
  }, [categories]);
  useEffect(() => {
    if (sheet) return;
    const key = (e: KeyboardEvent) => {
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      const symbol = /^\d$/.test(e.key)
        ? e.key
        : [".", ","].includes(e.key)
          ? "decimal"
          : e.key === "Backspace"
            ? "backspace"
            : null;
      if (symbol) {
        e.preventDefault();
        setAmount((v) => amountFromKeys(v, symbol));
        setAttempt(null);
        setError("");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [sheet]);
  const addMutation = useMutation({
    mutationFn: (submission: { key: string; body: OperationInput }) =>
      request<Operation>("/transactions", {
        method: "POST",
        key: submission.key,
        body: JSON.stringify(submission.body),
      }),
    onSuccess: async (op) => {
      setAmount("");
      setCategoryId("");
      setNote("");
      setAttempt(null);
      setError("");
      setFeedback("Записано: " + formatMoney(op.amount, op.currency));
      telegram?.HapticFeedback?.notificationOccurred("success");
      await refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось записать расход"),
    onSettled: () => {
      pending.current = false;
    },
  });
  function writeExpense() {
    if (!selectedAccount || !selectedCategory || !(Number(amount) > 0) || pending.current) return;
    pending.current = true;
    setFeedback("");
    setError("");
    const submission = attempt || {
      key: crypto.randomUUID(),
      body: {
        kind: "expense" as const,
        amount: amount.endsWith(".") ? amount.slice(0, -1) : amount,
        accountId: selectedAccount.id,
        categoryId: selectedCategory.id,
        note,
        occurredAt: occurrenceForDay(day, owner.timezone || "Asia/Tashkent"),
      },
    };
    setAttempt(submission);
    addMutation.mutate(submission);
  }
  function useKey(key: string) {
    setAmount((v) => amountFromKeys(v, key));
    setAttempt(null);
    setError("");
    setFeedback("");
    telegram?.HapticFeedback?.impactOccurred("light");
  }
  const displayedDate = DateTime.fromISO(day).setLocale("ru").toFormat("d LLL");
  const remaining = summary.remaining;
  const close = () => setSheet(null);
  return (
    <div className="home">
      <div className="composer-head">
        <div>
          <h1>Быстрая запись</h1>
        </div>
        <button className="account-chip" onClick={() => setSheet("details")}>
          {selectedAccount?.name || "Счёт"} · {displayedDate} <ChevronDown size={16} />
        </button>
      </div>
      <div className="amount-wrap">
        <output
          className={"amount-display " + (amountLabel(amount).length > 13 ? "amount-small" : "")}
          aria-label="Сумма расхода"
          aria-live="polite"
        >
          {amountLabel(amount)}
        </output>
        <span className="unit">{currencyUnit(selectedAccount?.currency || "UZS")}</span>
        <button
          className="clear-amount"
          aria-label="Очистить сумму"
          disabled={!amount}
          onClick={() => useKey("clear")}
        >
          <X size={19} />
        </button>
      </div>
      <button
        className={"category-picker " + (selectedCategory ? "selected" : "")}
        onClick={() => setSheet("category")}
      >
        <span className="category-left">
          {selectedCategory ? <CategoryIcon name={selectedCategory.icon} /> : <Shapes size={20} />}
          <span>{selectedCategory?.name || "Выбрать категорию"}</span>
        </span>
        <ChevronDown size={18} />
      </button>
      <div className="keypad" role="group" aria-label="Цифровая клавиатура">
        {keys.map((k) => (
          <button
            key={k}
            className={"key " + (/\D/.test(k) ? "key-util" : "")}
            onClick={() => useKey(k)}
            aria-label={
              k === "decimal"
                ? "Десятичная запятая"
                : k === "backspace"
                  ? "Удалить последнюю цифру"
                  : undefined
            }
          >
            {k === "decimal" ? "," : k === "backspace" ? <Delete size={23} /> : k}
          </button>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="expense-actions">
        <button
          className={"comment-expense " + (note.trim() ? "has-note" : "")}
          aria-label={
            note.trim() ? "Изменить комментарий к расходу" : "Добавить комментарий к расходу"
          }
          title={note.trim() ? "Изменить комментарий" : "Добавить комментарий"}
          disabled={addMutation.isPending}
          onClick={() => setSheet("note")}
        >
          <MessageSquareText size={21} />
        </button>
        <button
          className="primary save-expense"
          disabled={
            !(Number(amount) > 0 && selectedCategory && selectedAccount) || addMutation.isPending
          }
          onClick={writeExpense}
        >
          <Check size={19} />
          {addMutation.isPending ? "Сохраняем…" : "Записать расход"}
        </button>
      </div>
      <button className="budget-inline" onClick={onOpenBudget}>
        <span>
          {remaining === null
            ? `Бюджет на ${monthLabel(month)} не задан`
            : Number(remaining) < 0
              ? `Перерасход · ${monthLabel(month)}`
              : `Остаток бюджета · ${monthLabel(month)}`}
        </span>
        <strong>
          {remaining === null ? "Настроить" : money(Math.abs(Number(remaining))) + " сум"}
        </strong>
      </button>
      <SheetPresence>
        {sheet === "category" && (
          <Sheet title="Категория" label="Выбор категории" onClose={close}>
            <div className="category-grid">
              {activeCategories.map((c) => (
                <button
                  key={c.id}
                  className={"category-option " + (categoryId === c.id ? "selected" : "")}
                  onClick={() => {
                    setCategoryId(c.id);
                    setAttempt(null);
                    setError("");
                    close();
                  }}
                >
                  <CategoryIcon name={c.icon} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </Sheet>
        )}
      </SheetPresence>
      <SheetPresence>
        {sheet === "details" && (
          <Sheet title="Параметры расхода" onClose={close}>
            <div className="sheet-body">
              <SelectField
                label="Счёт"
                value={selectedAccount?.id || ""}
                options={accountChoices(activeAccounts)}
                onChange={(value) => {
                  setAccountId(value);
                  setAttempt(null);
                }}
              />
              <label className="field-label">
                Дата
                <input
                  className="field"
                  type="date"
                  max={today()}
                  value={day}
                  onChange={(e) => {
                    setDay(e.target.value);
                    setAttempt(null);
                  }}
                />
              </label>
              <label className="field-label">
                Комментарий
                <input
                  className="field"
                  maxLength={500}
                  value={note}
                  placeholder="Необязательно"
                  onChange={(e) => {
                    setNote(e.target.value);
                    setAttempt(null);
                  }}
                />
              </label>
              <button className="primary full" onClick={close}>
                Готово
              </button>
            </div>
          </Sheet>
        )}
      </SheetPresence>
      <SheetPresence>
        {sheet === "note" && (
          <Sheet title="Комментарий" label="Комментарий к расходу" onClose={close}>
            <div className="sheet-body">
              <p className="sheet-desc">Этот комментарий сохранится вместе с расходом.</p>
              <label className="field-label">
                Комментарий
                <textarea
                  className="field note-field"
                  maxLength={500}
                  value={note}
                  autoFocus
                  placeholder="Например, обед с друзьями"
                  onChange={(e) => {
                    setNote(e.target.value);
                    setAttempt(null);
                  }}
                />
              </label>
              <div className="note-actions">
                {note && (
                  <button
                    className="quiet"
                    onClick={() => {
                      setNote("");
                      setAttempt(null);
                    }}
                  >
                    Очистить
                  </button>
                )}
                <button className="primary" onClick={close}>
                  Готово
                </button>
              </div>
            </div>
          </Sheet>
        )}
      </SheetPresence>
    </div>
  );
}

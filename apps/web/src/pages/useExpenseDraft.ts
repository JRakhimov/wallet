import { useState } from "react";
import { OperationInput } from "../api";
import { today } from "@ui/lib/format";

// Lives in App so an unsaved expense survives switching tabs.
export function useExpenseDraft() {
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(today());
  const [attempt, setAttempt] = useState<{
    key: string;
    body: OperationInput;
  } | null>(null);
  return {
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
  };
}
export type ExpenseDraft = ReturnType<typeof useExpenseDraft>;

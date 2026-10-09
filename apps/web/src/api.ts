/** Wallet API: response types and wallet-specific requests. */

import { apiUrl, authHeaders } from "@ui/lib/api-client";

export type Account = {
  id: string;
  name: string;
  kind: string;
  currency: string;
  archived: boolean;
  balance: string;
};
export type Category = {
  id: string;
  name: string;
  kind: "expense" | "income";
  icon: string;
  archived: boolean;
  favorite: boolean;
  position: number;
};
export type Entry = { accountId: string; accountName: string; amount: string };
export type Operation = {
  id: string;
  kind: "expense" | "income" | "transfer" | "adjustment" | "refund" | "opening";
  amount: string;
  currency: string;
  category: Category | null;
  note: string;
  occurredAt: string;
  localDate: string;
  version: number;
  deleted: boolean;
  parentId: string | null;
  refunded: string;
  entries: Entry[];
};
export type Summary = {
  month: string;
  expense: string;
  refunds: string;
  netExpense: string;
  income: string;
  budget: string | null;
  remaining: string | null;
  categories: { id: string; name: string; icon: string; value: string }[];
  days: { date: string; value: string }[];
};
export type OperationInput = {
  kind: "expense" | "income" | "transfer" | "adjustment" | "refund";
  amount: string;
  accountId: string;
  categoryId?: string;
  targetAccountId?: string;
  parentId?: string;
  direction?: "in" | "out";
  note: string;
  occurredAt: string;
};
export async function downloadCsv(month: string) {
  const response = await fetch(
    apiUrl("/exports/transactions.csv?month=" + encodeURIComponent(month)),
    { headers: authHeaders(), cache: "no-store" },
  );
  if (!response.ok) throw new Error("Не удалось выгрузить CSV");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "wallet-" + month + ".csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

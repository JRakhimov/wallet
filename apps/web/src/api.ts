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
/** A monthly subscription: GET /subscriptions. `daysLeft` counts from today to the next charge. */
export type Subscription = {
  id: string;
  name: string;
  amount: string;
  chargeDay: number;
  nextChargeDate: string;
  daysLeft: number;
};
export type Entry = { accountId: string; accountName: string; currency: string; amount: string };
export type Operation = {
  id: string;
  kind: "expense" | "income" | "transfer" | "adjustment" | "refund" | "opening";
  amount: string;
  currency: string;
  /** UZS per 1 USD, set only on transfers between accounts in different currencies. */
  rate: string | null;
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
/** Spending patterns of a month: GET /reports/insights. Amounts are strings with two decimals. */
export type Insights = {
  month: string;
  today: string;
  recent: {
    /** The usual day: average of the 30 days before the last three. */
    average: string;
    days: { date: string; value: string; changePercent: number | null }[];
  };
  weeks: {
    start: string;
    end: string;
    /** Days of the week that are in the month and not in the future. */
    days: number;
    value: string;
    count: number;
    current: boolean;
    peak: boolean;
  }[];
  weekdays: Record<"weekday" | "weekend", WeekdayGroup>;
  trends: {
    previous: {
      month: string;
      comparedDays: number;
      total: string;
      previousTotal: string;
      changePercent: number | null;
      categories: {
        id: string;
        name: string;
        icon: string;
        value: string;
        previous: string;
        changePercent: number | null;
      }[];
    };
    forecast: {
      perDay: string;
      projected: string;
      budget: string | null;
      exceedsBudget: boolean | null;
    } | null;
    history: { month: string; value: string }[];
  };
  facts: {
    count: number;
    averageCheck: string | null;
    biggest: { amount: string; note: string; category: string; date: string } | null;
    busiestDay: { date: string; value: string } | null;
    topNotes: { note: string; count: number; total: string }[];
  };
};
type WeekdayGroup = {
  total: string;
  days: number;
  perDay: string;
  topCategory: { name: string; icon: string; value: string } | null;
};
export type OperationInput = {
  kind: "expense" | "income" | "transfer" | "adjustment" | "refund";
  amount: string;
  accountId: string;
  categoryId?: string;
  targetAccountId?: string;
  /** UZS per 1 USD; required only for a transfer between different currencies. */
  rate?: string;
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

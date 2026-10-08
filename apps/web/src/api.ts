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
export type Owner = {
  id: string;
  name: string;
  timezone: string;
  theme: "system" | "light" | "dark";
  currency: string;
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
import { AuthMode, clearSession, loadSession, saveSession, Session } from "./lib/session";
import { openedInTelegram, telegramInitData } from "./lib/telegram";

let accessToken = "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const apiBase = (
  (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL || ""
).replace(/\/$/, "");
const apiUrl = (path: string) =>
  apiBase
    ? apiBase.endsWith("/api")
      ? `${apiBase}${path}`
      : `${apiBase}/api${path}`
    : `/api${path}`;

export async function request<T>(
  path: string,
  options: RequestInit & { key?: string } = {},
): Promise<T> {
  const { key, ...rest } = options;
  const response = await fetch(apiUrl(path), {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
      ...rest.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => ({ message: "Не удалось выполнить запрос" }))) as { message?: string };
    throw new ApiError(response.status, body.message || "Не удалось выполнить запрос");
  }
  return response.json() as Promise<T>;
}
/** Signs in, reusing the stored session when it is still valid. */
export async function login(): Promise<AuthMode> {
  const session = loadSession() ?? (await signIn());
  accessToken = session.token;
  return session.mode;
}

/** Forgets the stored session and signs in again. */
export async function relogin(): Promise<AuthMode> {
  clearSession();
  return login();
}

async function signIn(): Promise<Session> {
  // Inside Telegram try Telegram sign-in first to skip the /auth/config round trip.
  // A dev-mode server rejects it with 403, then we fall back to the config check.
  if (openedInTelegram()) {
    try {
      return await signInWithTelegram();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 403)) {
        throw error;
      }
    }
  }
  const config = await request<{ dev: boolean }>("/auth/config");
  return config.dev ? signInDev() : signInWithTelegram();
}

async function signInWithTelegram() {
  const initData = await telegramInitData();
  return storeSession(
    await request<Session>("/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData }),
    }),
  );
}

async function signInDev() {
  return storeSession(await request<Session>("/auth/dev", { method: "POST" }));
}

function storeSession(session: Session) {
  saveSession(session);
  return session;
}

export async function downloadCsv(month: string) {
  const response = await fetch(
    apiUrl("/exports/transactions.csv?month=" + encodeURIComponent(month)),
    { headers: { Authorization: "Bearer " + accessToken }, cache: "no-store" },
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

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
let accessToken = "";
let telegramScript: Promise<void> | undefined;
function loadTelegramSdk() {
  if (window.Telegram?.WebApp) return Promise.resolve();
  if (!telegramScript)
    telegramScript = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-web-app.js";
      script.onload = () => resolve();
      script.onerror = () => {
        telegramScript = undefined;
        script.remove();
        reject(new Error("Не удалось загрузить Telegram. Переоткройте приложение"));
      };
      document.head.appendChild(script);
    });
  return telegramScript;
}
export function setupTelegram() {
  const app = window.Telegram?.WebApp;
  app?.ready();
  app?.expand();
  app?.disableVerticalSwipes?.();
  syncTelegramColors();
}
export function syncTelegramColors() {
  const app = window.Telegram?.WebApp;
  if (!app) return;
  const style = getComputedStyle(document.documentElement);
  const bg = style.getPropertyValue("--bg").trim(),
    surface = style.getPropertyValue("--surface").trim();
  app.setHeaderColor?.(surface);
  app.setBackgroundColor?.(bg);
  app.setBottomBarColor?.(surface);
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function setToken(token: string) {
  accessToken = token;
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
export async function login(): Promise<"dev" | "telegram"> {
  const config = await request<{ dev: boolean }>("/auth/config");
  if (config.dev) {
    const data = await request<{ token: string }>("/auth/dev", { method: "POST" });
    setToken(data.token);
    return "dev";
  }
  await loadTelegramSdk();
  setupTelegram();
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) throw new Error("Откройте кошелёк через Telegram");
  const data = await request<{ token: string }>("/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ initData }),
  });
  setToken(data.token);
  return "telegram";
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
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        disableVerticalSwipes?: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        setBottomBarColor?: (color: string) => void;
        HapticFeedback?: {
          impactOccurred: (style: string) => void;
          notificationOccurred: (type: string) => void;
        };
        colorScheme?: string;
        BackButton?: {
          show: () => void;
          hide: () => void;
          onClick: (f: () => void) => void;
          offClick: (f: () => void) => void;
        };
      };
    };
  }
}

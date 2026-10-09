/** HTTP client for the shared API: sessions, Telegram sign-in and JSON requests. */

import { platform } from "./platform";
import { AuthMode, clearSession, loadSession, saveSession, Session } from "./session";
import { openedInTelegram, telegramInitData } from "./telegram";

let accessToken = "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Full URL of an API path: "/accounts" → "https://api.example.com/api/accounts". */
export function apiUrl(path: string) {
  const base = platform().apiBaseUrl;
  if (!base) {
    return `/api${path}`;
  }
  return base.endsWith("/api") ? `${base}${path}` : `${base}/api${path}`;
}

/** Authorization header for requests made outside `request()`, e.g. file downloads. */
export function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export async function request<T>(
  path: string,
  options: RequestInit & { key?: string } = {},
): Promise<T> {
  const { key, ...rest } = options;
  const response = await fetch(apiUrl(path), {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
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

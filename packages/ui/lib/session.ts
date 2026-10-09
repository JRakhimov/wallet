/** Session token persisted between app launches, so a reopen skips sign-in. */

import { storageKey } from "./platform";

export type AuthMode = "dev" | "telegram";

export type Session = { token: string; expiresAt: string; mode: AuthMode };

const SESSION_KEY = "session";
// Treat sessions about to expire as expired, so requests don't fail mid-use.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

export function loadSession(): Session | null {
  try {
    const session = JSON.parse(
      localStorage.getItem(storageKey(SESSION_KEY)) || "null",
    ) as Session | null;
    const usable = session && new Date(session.expiresAt).getTime() - EXPIRY_MARGIN_MS > Date.now();
    return usable ? session : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(storageKey(SESSION_KEY), JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(storageKey(SESSION_KEY));
}

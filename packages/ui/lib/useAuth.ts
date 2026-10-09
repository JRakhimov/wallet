import { useEffect, useRef, useState } from "react";
import { ApiError, login, relogin } from "./api-client";
import { AuthMode } from "./session";
import { initTelegram } from "./telegram";

export type AuthStatus = "loading" | AuthMode | "error";

/** Signs in on mount (Telegram or dev) and exposes the result for gating data queries. */
export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState("");

  /** `fresh` drops the stored session, e.g. after the server rejected it. */
  async function signIn(fresh = false) {
    setStatus("loading");
    setError("");
    try {
      setStatus(await (fresh ? relogin() : login()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить вход");
      setStatus("error");
    }
  }

  useEffect(() => {
    initTelegram();
    void signIn();
  }, []);

  return {
    status,
    error,
    /** True once signed in: data queries may run. */
    ready: status === "dev" || status === "telegram",
    devMode: status === "dev",
    signIn,
  };
}

/**
 * Detects a rejected session (401 from any data query). A stored session can be revoked
 * or expire early, so it signs in again once, silently. Returns true while it stays expired.
 */
export function useSessionExpiry(error: unknown, signIn: (fresh: boolean) => Promise<void>) {
  const retried = useRef(false);
  const expired = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (expired && !retried.current) {
      retried.current = true;
      void signIn(true);
    }
  }, [expired]);

  return expired;
}

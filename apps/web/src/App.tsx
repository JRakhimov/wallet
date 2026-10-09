import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Home, List, MoreHorizontal, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Account, Category, Owner, Summary } from "./api";
import { ApiError, login, relogin, request } from "@ui/lib/api-client";
import { currentMonth } from "@ui/lib/format";
import { initTelegram, syncTelegramColors } from "@ui/lib/telegram";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { MorePage, MoreSheet } from "./pages/MorePage";
import { ReportsPage } from "./pages/ReportsPage";
import { useExpenseDraft } from "./pages/useExpenseDraft";

type Tab = "home" | "history" | "reports" | "more";
const tabs: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: "home", label: "Главная", Icon: Home },
  { id: "history", label: "История", Icon: List },
  { id: "reports", label: "Отчёты", Icon: BarChart3 },
  { id: "more", label: "Ещё", Icon: MoreHorizontal },
];

export function App() {
  const qc = useQueryClient();
  const [auth, setAuth] = useState<"loading" | "dev" | "telegram" | "error">("loading");
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [month, setMonth] = useState(currentMonth());
  const [feedback, setFeedback] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [moreSheet, setMoreSheet] = useState<MoreSheet | null>(null);
  const draft = useExpenseDraft();
  const autoRelogin = useRef(false);

  /** `fresh` drops the stored session, e.g. after the server rejected it. */
  async function signIn(fresh = false) {
    setAuth("loading");
    setAuthError("");
    try {
      setAuth(await (fresh ? relogin() : login()));
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Не удалось выполнить вход");
      setAuth("error");
    }
  }
  useEffect(() => {
    initTelegram();
    void signIn();
  }, []);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(""), 3000);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  const ready = auth === "dev" || auth === "telegram";
  const ownerQ = useQuery({
    queryKey: ["owner"],
    queryFn: () => request<Owner>("/me"),
    enabled: ready,
  });
  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: () => request<Account[]>("/accounts"),
    enabled: ready,
  });
  const catsQ = useQuery({
    queryKey: ["categories"],
    queryFn: () => request<Category[]>("/categories"),
    enabled: ready,
  });
  const summaryQ = useQuery({
    queryKey: ["summary", month],
    queryFn: () => request<Summary>("/reports/summary?month=" + month),
    enabled: ready,
  });
  const commonError = ownerQ.error || accountsQ.error || catsQ.error || summaryQ.error;
  const sessionExpired = commonError instanceof ApiError && commonError.status === 401;
  // A stored session can be revoked or expire early: sign in again once, silently.
  useEffect(() => {
    if (sessionExpired && !autoRelogin.current) {
      autoRelogin.current = true;
      void signIn(true);
    }
  }, [sessionExpired]);
  useEffect(() => {
    if (ownerQ.data) {
      document.documentElement.dataset.theme = ownerQ.data.theme;
      document.documentElement.lang = "ru";
      syncTelegramColors();
    }
  }, [ownerQ.data]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", syncTelegramColors);
    return () => media.removeEventListener("change", syncTelegramColors);
  }, []);
  function changeTab(next: Tab) {
    setTab(next);
    if (next === "home") setMonth(currentMonth());
    setMoreSheet(null);
    setFeedback("");
    setCategoryFilter(null);
  }
  if (auth === "loading")
    return (
      <div className="center-state">
        <div className="loader" />
        <p>Открываем кошелёк…</p>
      </div>
    );
  if (auth === "error")
    return (
      <div className="center-state">
        <Wallet size={42} />
        <h1>Не удалось открыть кошелёк</h1>
        <p>{authError}</p>
        <button className="primary" onClick={() => void signIn()}>
          Повторить
        </button>
      </div>
    );
  if (sessionExpired)
    return (
      <div className="center-state">
        <h1>Сессия истекла</h1>
        <p>Войдите снова, чтобы продолжить.</p>
        <button className="primary" onClick={() => void signIn(true)}>
          Войти
        </button>
      </div>
    );
  if (!ownerQ.data || !accountsQ.data || !catsQ.data || !summaryQ.data)
    return (
      <div className="center-state">
        <div className="loader" />
        <p>{commonError instanceof Error ? commonError.message : "Загружаем данные…"}</p>
        <button className="quiet" onClick={() => void qc.invalidateQueries()}>
          Обновить
        </button>
      </div>
    );
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">
            <Wallet size={20} />
          </span>
          <span>Wallet</span>
        </div>
        <div className="header-right">
          {auth === "dev" && <span className="dev-badge">[Dev]</span>}
        </div>
      </header>
      {feedback && (
        <div className="toast" role="status">
          {feedback}
        </div>
      )}
      <main className={"main main-" + tab}>
        {tab === "home" && (
          <HomePage
            draft={draft}
            owner={ownerQ.data}
            accounts={accountsQ.data}
            categories={catsQ.data}
            summary={summaryQ.data}
            month={month}
            setFeedback={setFeedback}
            onOpenBudget={() => {
              setMoreSheet({ kind: "budget" });
              setTab("more");
            }}
          />
        )}
        {tab === "history" && (
          <HistoryPage
            month={month}
            setMonth={setMonth}
            accounts={accountsQ.data}
            categories={catsQ.data}
            timezone={ownerQ.data.timezone}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            onAdd={() => changeTab("home")}
          />
        )}
        {tab === "reports" && (
          <ReportsPage
            month={month}
            setMonth={setMonth}
            summary={summaryQ.data}
            onCategory={(id) => {
              setCategoryFilter(id);
              setTab("history");
            }}
          />
        )}
        {tab === "more" && (
          <MorePage
            month={month}
            owner={ownerQ.data}
            accounts={accountsQ.data}
            categories={catsQ.data}
            summary={summaryQ.data}
            initialSheet={moreSheet}
          />
        )}
      </main>
      <nav className="bottom-nav" aria-label="Основная навигация">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => changeTab(id)}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

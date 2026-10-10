import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Home, List, LogOut, MoreHorizontal, Wallet } from "lucide-react";
import { Account, Category, Summary } from "./api";
import { AppShell, ShellTab } from "@ui/components/AppShell";
import { CenterState } from "@ui/components/CenterState";
import { FloatingButton } from "@ui/components/FloatingButton";
import { request } from "@ui/lib/api-client";
import { currentMonth } from "@ui/lib/format";
import { useOwner } from "@ui/lib/owner";
import { closeTelegramApp, openedInTelegram } from "@ui/lib/telegram";
import { useAuth, useSessionExpiry } from "@ui/lib/useAuth";
import { useThemeSync } from "@ui/lib/useThemeSync";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { MorePage, MoreSheet } from "./pages/MorePage";
import { ReportsPage } from "./pages/ReportsPage";
import { useExpenseDraft } from "./pages/useExpenseDraft";

type Tab = "home" | "history" | "reports" | "more";
const tabs: ShellTab<Tab>[] = [
  { id: "home", label: "Главная", Icon: Home },
  { id: "history", label: "История", Icon: List },
  { id: "reports", label: "Отчёты", Icon: BarChart3 },
  { id: "more", label: "Ещё", Icon: MoreHorizontal },
];

export function App() {
  const qc = useQueryClient();
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("home");
  const [month, setMonth] = useState(currentMonth());
  const [feedback, setFeedback] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [moreSheet, setMoreSheet] = useState<MoreSheet | null>(null);
  const draft = useExpenseDraft();
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(""), 3000);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  const ownerQ = useOwner(auth.ready);
  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: () => request<Account[]>("/accounts"),
    enabled: auth.ready,
  });
  const catsQ = useQuery({
    queryKey: ["categories"],
    queryFn: () => request<Category[]>("/categories"),
    enabled: auth.ready,
  });
  const summaryQ = useQuery({
    queryKey: ["summary", month],
    queryFn: () => request<Summary>("/reports/summary?month=" + month),
    enabled: auth.ready,
  });
  const commonError = ownerQ.error || accountsQ.error || catsQ.error || summaryQ.error;
  const sessionExpired = useSessionExpiry(commonError, auth.signIn);
  useThemeSync(ownerQ.data?.theme);
  function changeTab(next: Tab) {
    setTab(next);
    if (next === "home") setMonth(currentMonth());
    setMoreSheet(null);
    setFeedback("");
    setCategoryFilter(null);
  }

  /** Close button on the "more" tab, only inside Telegram. */
  function floatingControl() {
    if (tab === "more" && openedInTelegram()) {
      return <FloatingButton label="Закрыть приложение" Icon={LogOut} onClick={closeTelegramApp} />;
    }

    return null;
  }

  if (auth.status === "loading") {
    return <CenterState loading message="Открываем кошелёк…" />;
  }
  if (auth.status === "error") {
    return (
      <CenterState
        Icon={Wallet}
        title="Не удалось открыть кошелёк"
        message={auth.error}
        action={{ label: "Повторить", onClick: () => void auth.signIn() }}
      />
    );
  }
  if (sessionExpired) {
    return (
      <CenterState
        title="Сессия истекла"
        message="Войдите снова, чтобы продолжить."
        action={{ label: "Войти", onClick: () => void auth.signIn(true) }}
      />
    );
  }
  if (!ownerQ.data || !accountsQ.data || !catsQ.data || !summaryQ.data) {
    return (
      <CenterState
        loading
        message={commonError instanceof Error ? commonError.message : "Загружаем данные…"}
        action={{ label: "Обновить", quiet: true, onClick: () => void qc.invalidateQueries() }}
      />
    );
  }
  return (
    <AppShell
      name="Wallet"
      Icon={Wallet}
      devMode={auth.devMode}
      tabs={tabs}
      activeTab={tab}
      onTabChange={changeTab}
      toast={feedback}
      floating={floatingControl()}
    >
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
    </AppShell>
  );
}

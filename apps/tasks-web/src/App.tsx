import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Ellipsis, ListTodo, LogOut, Plus, StickyNote, Sun } from "lucide-react";
import { AppShell, ShellTab } from "@ui/components/AppShell";
import { CenterState } from "@ui/components/CenterState";
import { FloatingButton } from "@ui/components/FloatingButton";
import { SheetPresence } from "@ui/components/Sheet";
import { useOwner } from "@ui/lib/owner";
import { closeTelegramApp, openedInTelegram } from "@ui/lib/telegram";
import { useAuth, useSessionExpiry } from "@ui/lib/useAuth";
import { useThemeSync } from "@ui/lib/useThemeSync";
import { completeTask, reopenTask, Task, useTaskCache, useTasks } from "./api";
import { TaskSheet } from "./components/TaskSheet";
import { dayLabel, plusDays, todayIn } from "./lib/due";
import { MorePage } from "./pages/MorePage";
import { NotesPage } from "./pages/NotesPage";
import { PlansPage } from "./pages/PlansPage";
import { TodayPage } from "./pages/TodayPage";

type Tab = "today" | "plans" | "notes" | "more";

const tabs: ShellTab<Tab>[] = [
  { id: "today", label: "Сегодня", Icon: Sun },
  { id: "plans", label: "Планы", Icon: CalendarDays },
  { id: "notes", label: "Заметки", Icon: StickyNote },
  { id: "more", label: "Ещё", Icon: Ellipsis },
];

const TOAST_MS = 3000;

/** `task` is set when an existing task is edited. */
type SheetState = { task: Task | null } | null;

export function App() {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("today");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState("");

  const ownerQ = useOwner(auth.ready);
  const tasksQ = useTasks(auth.ready);
  const cache = useTaskCache();

  const commonError = ownerQ.error || tasksQ.error;
  const sessionExpired = useSessionExpiry(commonError, auth.signIn);
  useThemeSync(ownerQ.data?.theme);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(""), TOAST_MS);

    return () => window.clearTimeout(timer);
  }, [toast]);

  const timezone = ownerQ.data?.timezone ?? "Asia/Tashkent";

  /** The date a new task gets on the current tab. */
  function initialDate() {
    const today = todayIn(timezone);
    const dates: Record<Tab, string | null> = {
      today,
      plans: plusDays(today, 1),
      notes: null,
      more: today,
    };

    return dates[tab];
  }

  async function toggle(task: Task) {
    try {
      if (task.doneAt) {
        cache.put(await reopenTask(task));
        return;
      }

      // Tick at once; a repeating task shows its next date when the server answers.
      if (task.repeat === "none") {
        cache.put({ ...task, doneAt: new Date().toISOString() });
      }

      const updated = await completeTask(task);
      cache.put(updated);

      if (updated.repeat !== "none" && updated.dueDate) {
        setToast(`Следующий раз: ${dayLabel(updated.dueDate, timezone).toLowerCase()}`);
      }
    } catch (e) {
      void cache.refresh();
      setToast(e instanceof Error ? e.message : "Не удалось сохранить");
    }
  }

  function saved(task: Task, isNew: boolean) {
    cache.put(task);
    setSheet(null);

    if (isNew) {
      const day = task.dueDate ? dayLabel(task.dueDate, timezone).toLowerCase() : "";

      setToast(day ? `Добавлено: ${day}` : "Заметка добавлена");
    }
  }

  function deleted(task: Task) {
    cache.drop(task.id);
    setSheet(null);
    setToast("Задача удалена");
  }

  /** Add button everywhere, close button on «Ещё» (only inside Telegram). */
  function floatingControl() {
    if (tab === "more" && openedInTelegram()) {
      return <FloatingButton label="Закрыть приложение" Icon={LogOut} onClick={closeTelegramApp} />;
    }

    return (
      <FloatingButton
        label="Добавить задачу"
        Icon={Plus}
        onClick={() => setSheet({ task: null })}
      />
    );
  }

  if (auth.status === "loading") {
    return <CenterState loading message="Открываем задачи…" />;
  }

  if (auth.status === "error") {
    return (
      <CenterState
        Icon={ListTodo}
        title="Не удалось открыть приложение"
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

  if (!ownerQ.data || !tasksQ.data) {
    return (
      <CenterState
        loading
        message={commonError instanceof Error ? commonError.message : "Загружаем задачи…"}
        action={{
          label: "Обновить",
          quiet: true,
          onClick: () => void queryClient.invalidateQueries(),
        }}
      />
    );
  }

  const pageProps = {
    tasks: tasksQ.data,
    timezone,
    onToggle: (task: Task) => void toggle(task),
    onOpen: (task: Task) => setSheet({ task }),
  };

  return (
    <AppShell
      name="Задачи"
      Icon={ListTodo}
      devMode={auth.devMode}
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      toast={toast}
      floating={floatingControl()}
    >
      {tab === "today" && <TodayPage {...pageProps} />}
      {tab === "plans" && <PlansPage {...pageProps} />}
      {tab === "notes" && <NotesPage {...pageProps} />}
      {tab === "more" && <MorePage {...pageProps} owner={ownerQ.data} onError={setToast} />}

      <SheetPresence>
        {sheet && (
          <TaskSheet
            task={sheet.task}
            initialDate={initialDate()}
            timezone={timezone}
            onClose={() => setSheet(null)}
            onSaved={saved}
            onDeleted={deleted}
          />
        )}
      </SheetPresence>
    </AppShell>
  );
}

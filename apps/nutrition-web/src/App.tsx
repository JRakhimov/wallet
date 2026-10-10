import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Camera,
  CircleUserRound,
  Dumbbell,
  Image as ImageIcon,
  LogOut,
  PenLine,
  Salad,
  Sun,
} from "lucide-react";
import { AppShell, ShellTab } from "@ui/components/AppShell";
import { SheetPresence } from "@ui/components/Sheet";
import { CenterState } from "@ui/components/CenterState";
import { FloatingActionMenu } from "@ui/components/FloatingActionMenu";
import { FloatingButton } from "@ui/components/FloatingButton";
import { useOwner } from "@ui/lib/owner";
import { closeTelegramApp, openedInTelegram } from "@ui/lib/telegram";
import { useAuth, useSessionExpiry } from "@ui/lib/useAuth";
import { useThemeSync } from "@ui/lib/useThemeSync";
import { Meal, useProfile, Workout } from "./api";
import { AddMealFlow, AddMealFlowHandle } from "./components/AddMealFlow";
import { WorkoutSheet } from "./components/WorkoutSheet";
import { formatNumber } from "./lib/labels";
import { usePendingMeals } from "./lib/pending-meals";
import { HistoryPage } from "./pages/HistoryPage";
import { Onboarding } from "./pages/Onboarding";
import { ProfilePage } from "./pages/ProfilePage";
import { TodayPage } from "./pages/TodayPage";

type Tab = "today" | "history" | "profile";
const tabs: ShellTab<Tab>[] = [
  { id: "today", label: "Сегодня", Icon: Sun },
  { id: "history", label: "История", Icon: CalendarDays },
  { id: "profile", label: "Профиль", Icon: CircleUserRound },
];

// Tabs where a new meal can be added from the floating button.
const TABS_WITH_ADD: Tab[] = ["today", "history"];
const TOAST_MS = 3000;

export function App() {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("today");

  // Changing the key remounts TodayPage, closing any open macro reference page.
  const [todayResetKey, setTodayResetKey] = useState(0);

  const [toast, setToast] = useState("");
  const addMeal = useRef<AddMealFlowHandle>(null);
  // `workout` is set when an existing workout is edited.
  const [workoutSheet, setWorkoutSheet] = useState<{ workout: Workout | null } | null>(null);
  const pendingMeals = usePendingMeals(auth.ready);
  const ownerQ = useOwner(auth.ready);
  const profileQ = useProfile(auth.ready);
  const commonError = ownerQ.error || profileQ.error;
  const sessionExpired = useSessionExpiry(commonError, auth.signIn);
  useThemeSync(ownerQ.data?.theme);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(""), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** Add-meal menu on diary tabs, close button on the profile (only inside Telegram). */
  function floatingControl() {
    if (TABS_WITH_ADD.includes(tab)) {
      return (
        <FloatingActionMenu
          label="Добавить приём пищи"
          actions={[
            { label: "Камера", Icon: Camera, onClick: () => addMeal.current?.startCamera() },
            { label: "Галерея", Icon: ImageIcon, onClick: () => addMeal.current?.startGallery() },
            { label: "Текст", Icon: PenLine, onClick: () => addMeal.current?.startText() },
            {
              label: "Тренировка",
              Icon: Dumbbell,
              onClick: () => setWorkoutSheet({ workout: null }),
            },
          ]}
        />
      );
    }
    if (tab === "profile" && openedInTelegram()) {
      return <FloatingButton label="Закрыть приложение" Icon={LogOut} onClick={closeTelegramApp} />;
    }
    return null;
  }

  function mealSaved(meal: Meal) {
    void queryClient.invalidateQueries({ queryKey: ["nutrition", "day"] });
    void queryClient.invalidateQueries({ queryKey: ["nutrition", "history"] });
    void pendingMeals.refresh();
    setToast(`Записано: ${formatNumber(meal.totals.kcal)} ккал`);
  }

  function workoutSaved(workout: Workout | null, wasEdit: boolean) {
    void queryClient.invalidateQueries({ queryKey: ["nutrition", "day"] });
    void queryClient.invalidateQueries({ queryKey: ["nutrition", "history"] });
    setWorkoutSheet(null);
    if (workout && !wasEdit) {
      setToast(`Тренировка записана: ${formatNumber(workout.kcal)} ккал`);
    }
  }

  if (auth.status === "loading") {
    return <CenterState loading message="Открываем дневник питания…" />;
  }
  if (auth.status === "error") {
    return (
      <CenterState
        Icon={Salad}
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
  // `profile` is null (not undefined) until onboarding is completed.
  if (!ownerQ.data || profileQ.data === undefined) {
    return (
      <CenterState
        loading
        message={commonError instanceof Error ? commonError.message : "Загружаем данные…"}
        action={{
          label: "Обновить",
          quiet: true,
          onClick: () => void queryClient.invalidateQueries(),
        }}
      />
    );
  }
  if (profileQ.data === null) {
    return <Onboarding />;
  }

  return (
    <AppShell
      name="Питание"
      Icon={Salad}
      devMode={auth.devMode}
      tabs={tabs}
      activeTab={tab}
      onTabChange={(next) => {
        if (next === "today" && tab === "today") {
          setTodayResetKey((key) => key + 1);
        }

        setTab(next);
      }}
      toast={toast}
      floating={floatingControl()}
    >
      {tab === "today" && (
        <TodayPage
          key={todayResetKey}
          profile={profileQ.data}
          timezone={ownerQ.data.timezone}
          pendingMeals={pendingMeals}
          onMealSaved={mealSaved}
          onEditWorkout={(workout) => setWorkoutSheet({ workout })}
        />
      )}
      {tab === "history" && <HistoryPage profile={profileQ.data} timezone={ownerQ.data.timezone} />}
      {tab === "profile" && <ProfilePage profile={profileQ.data} owner={ownerQ.data} />}
      <SheetPresence>
        {workoutSheet && (
          <WorkoutSheet
            workout={workoutSheet.workout}
            timezone={ownerQ.data.timezone}
            onClose={() => setWorkoutSheet(null)}
            onSaved={(workout) => workoutSaved(workout, workoutSheet.workout !== null)}
          />
        )}
      </SheetPresence>
      <AddMealFlow ref={addMeal} timezone={ownerQ.data.timezone} onSubmit={pendingMeals.start} />
    </AppShell>
  );
}

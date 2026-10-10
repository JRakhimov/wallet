import { DateTime } from "luxon";
import { TaskSection } from "../components/TaskSection";
import { byDue, todayIn } from "../lib/due";
import { TaskPageProps } from "./types";

/** Overdue tasks, today's tasks and what was done today. */
export function TodayPage({ tasks, timezone, onToggle, onOpen }: TaskPageProps) {
  const today = todayIn(timezone);
  const open = tasks.filter((task) => !task.doneAt && task.dueDate).sort(byDue);

  const overdue = open.filter((task) => task.dueDate! < today);
  const todays = open.filter((task) => task.dueDate === today);
  const doneToday = tasks.filter(
    (task) => task.doneAt && DateTime.fromISO(task.doneAt).setZone(timezone).toISODate() === today,
  );

  const heading = DateTime.now().setZone(timezone).setLocale("ru").toFormat("cccc, d MMMM");
  const sectionProps = { timezone, onToggle, onOpen };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Сегодня</h1>
          <p className="page-subtitle">{heading}</p>
        </div>
      </div>

      <TaskSection title="Просрочено" tone="danger" tasks={overdue} showDate {...sectionProps} />

      <TaskSection
        title={overdue.length ? "На сегодня" : undefined}
        tasks={todays}
        {...sectionProps}
      />

      {overdue.length + todays.length === 0 && (
        <p className="empty">На сегодня задач нет. Добавьте кнопкой «+» или голосом в боте.</p>
      )}

      <TaskSection title="Выполнено сегодня" tasks={doneToday} {...sectionProps} />
    </div>
  );
}

import { TaskSection } from "../components/TaskSection";
import { dayLabel, groupByDate, todayIn } from "../lib/due";
import { TaskPageProps } from "./types";

/** Tasks after today, grouped by day. */
export function PlansPage({ tasks, timezone, onToggle, onOpen }: TaskPageProps) {
  const today = todayIn(timezone);
  const upcoming = tasks.filter((task) => !task.doneAt && task.dueDate && task.dueDate > today);

  return (
    <div className="page">
      <div className="page-heading">
        <h1>Планы</h1>
      </div>

      {upcoming.length === 0 && <p className="empty">Впереди пока ничего не запланировано.</p>}

      {groupByDate(upcoming).map((group) => (
        <TaskSection
          key={group.date}
          title={dayLabel(group.date, timezone)}
          tasks={group.tasks}
          timezone={timezone}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

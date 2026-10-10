import { Task } from "../api";
import { TaskRow } from "./TaskRow";

/** A titled group of tasks on a card. */
export function TaskSection({
  title,
  tone,
  tasks,
  timezone,
  showDate = false,
  onToggle,
  onOpen,
}: {
  title?: string;
  tone?: "danger";
  tasks: Task[];
  timezone: string;
  showDate?: boolean;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
}) {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <section className="task-section">
      {title && <h2 className={"section-title" + (tone ? ` ${tone}` : "")}>{title}</h2>}

      <div className="task-list">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            timezone={timezone}
            showDate={showDate}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

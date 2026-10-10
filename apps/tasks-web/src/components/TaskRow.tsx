import { Check, Clock, Repeat as RepeatIcon, StickyNote } from "lucide-react";
import { Task } from "../api";
import { dayLabel, isOverdue } from "../lib/due";
import { repeatText } from "../lib/repeat";

/** One task: a round checkbox, the title and when it is due. Tapping the text opens it. */
export function TaskRow({
  task,
  timezone,
  showDate = false,
  onToggle,
  onOpen,
}: {
  task: Task;
  timezone: string;
  /** Show the day too, e.g. for overdue and done tasks. */
  showDate?: boolean;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
}) {
  const done = task.doneAt !== null;
  const overdue = isOverdue(task, timezone);
  const repeat = repeatText(task);

  const when = [showDate && task.dueDate ? dayLabel(task.dueDate, timezone) : "", task.dueTime]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={"task-row" + (done ? " done" : "")}>
      <button
        type="button"
        className="task-check"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? "Вернуть в список" : "Отметить выполненной"}
        onClick={() => onToggle(task)}
      >
        {done && <Check size={15} strokeWidth={3} />}
      </button>

      <button type="button" className="task-main" onClick={() => onOpen(task)}>
        <span className="task-title">{task.title}</span>

        {(when || repeat || task.note) && (
          <span className="task-meta">
            {when && (
              <span className={overdue ? "overdue" : ""}>
                <Clock size={13} aria-hidden="true" />
                {when}
              </span>
            )}

            {repeat && (
              <span>
                <RepeatIcon size={13} aria-hidden="true" />
                {repeat}
              </span>
            )}

            {task.note && (
              <span className="task-note">
                <StickyNote size={13} aria-hidden="true" />
                {task.note}
              </span>
            )}
          </span>
        )}
      </button>
    </div>
  );
}

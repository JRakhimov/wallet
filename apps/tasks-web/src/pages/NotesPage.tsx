import { TaskSection } from "../components/TaskSection";
import { TaskPageProps } from "./types";

/** Tasks without a date: notes and things to do some day. */
export function NotesPage({ tasks, timezone, onToggle, onOpen }: TaskPageProps) {
  const notes = tasks
    .filter((task) => !task.doneAt && !task.dueDate)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Заметки</h1>
          <p className="page-subtitle">Задачи без срока</p>
        </div>
      </div>

      {notes.length === 0 && (
        <p className="empty">Заметок нет. Скажите боту: «Запиши заметку купить молоко».</p>
      )}

      <TaskSection tasks={notes} timezone={timezone} onToggle={onToggle} onOpen={onOpen} />
    </div>
  );
}

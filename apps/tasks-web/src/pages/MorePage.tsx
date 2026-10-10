import { ThemeSelect } from "@ui/components/ThemeSelect";
import { Owner } from "@ui/lib/owner";
import { TaskSection } from "../components/TaskSection";
import { TaskPageProps } from "./types";

/** Tasks done in the last week (they can be returned) and the theme. */
export function MorePage({
  tasks,
  timezone,
  owner,
  onToggle,
  onOpen,
  onError,
}: TaskPageProps & { owner: Owner; onError: (message: string) => void }) {
  const done = tasks
    .filter((task) => task.doneAt)
    .sort((a, b) => b.doneAt!.localeCompare(a.doneAt!));

  return (
    <div className="page">
      <div className="page-heading">
        <h1>Ещё</h1>
      </div>

      <ThemeSelect value={owner.theme} onError={onError} />

      <TaskSection
        title="Выполнено за неделю"
        tasks={done}
        timezone={timezone}
        showDate
        onToggle={onToggle}
        onOpen={onOpen}
      />

      {done.length === 0 && <p className="empty">За последнюю неделю ничего не выполнено.</p>}

      <p className="page-subtitle tasks-hint">
        Голосом в боте: «Напомни завтра в 10 позвонить в банк», «Каждый понедельник в 9 напоминай
        про отчёт», «Запиши заметку купить молоко».
      </p>
    </div>
  );
}

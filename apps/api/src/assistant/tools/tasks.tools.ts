import { DateTime } from "luxon";
import { z } from "zod/v4";
import { createTaskSchema, UpdateTaskDto, updateTaskSchema } from "../../tasks/dto/task.dto";
import { dueLabel } from "../../tasks/labels";
import { remindAtFor, REPEATS } from "../../tasks/recurrence";
import { TasksService, TaskView } from "../../tasks/tasks.service";
import { taskConfirmation, taskDue } from "../format";
import {
  checkId,
  defineAction,
  defineTool,
  ToolContext,
  ToolError,
  Toolset,
  validate,
} from "./tool";

export type TasksDeps = {
  tasks: Pick<TasksService, "list" | "create" | "update" | "complete" | "reopen" | "remove">;
};

/** Tasks due within this many days count as upcoming; later ones go to "later". */
const UPCOMING_DAYS = 14;
const MAX_PER_GROUP = 30;

/** To-dos, reminders and notes (a note is a task without a date). */
export function tasksTools(deps: TasksDeps): Toolset {
  return {
    tools: [listTasks(deps), addTask(deps), completeTask(deps), updateTask(deps), deleteTask(deps)],
    actions: tasksActions(deps),
  };
}

/** Open tasks by when they are due, and the ones done in the last days. */
export function groupTasks(tasks: TaskView[], now: DateTime) {
  const today = now.toISODate()!;
  const soon = now.plus({ days: UPCOMING_DAYS }).toISODate()!;
  const open = tasks.filter((task) => !task.doneAt).sort(byDue);
  const dated = (test: (dueDate: string) => boolean) =>
    open.filter((task) => task.dueDate !== null && test(task.dueDate));

  return {
    overdue: dated((dueDate) => dueDate < today),
    today: dated((dueDate) => dueDate === today),
    upcoming: dated((dueDate) => dueDate > today && dueDate <= soon),
    later: dated((dueDate) => dueDate > soon),
    notes: open.filter((task) => task.dueDate === null),
    done: tasks.filter((task) => task.doneAt !== null),
  };
}

/** A task as the model sees it. */
export function compactTask(task: TaskView, now: DateTime) {
  return {
    id: task.id,
    title: task.title,
    note: task.note,
    due: taskDue(task, now),
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    repeat: task.repeat,
    doneAt: task.doneAt,
  };
}

function tasksActions(deps: TasksDeps) {
  return {
    undo_task: defineAction<{ id: string; version: number }>(async (ownerId, payload) => {
      await deps.tasks.remove(ownerId, payload.id, payload.version);

      return "↩️ Задача удалена";
    }),

    undo_complete: defineAction<{ id: string; version: number }>(async (ownerId, payload) => {
      await deps.tasks.reopen(ownerId, payload.id, payload.version);

      return "↩️ Задача снова открыта";
    }),

    update_task: defineAction<{ id: string; input: UpdateTaskDto }>(async (ownerId, payload) => {
      await deps.tasks.update(ownerId, payload.id, payload.input);

      return "✅ Задача изменена";
    }),

    delete_task: defineAction<{ id: string; version: number }>(async (ownerId, payload) => {
      await deps.tasks.remove(ownerId, payload.id, payload.version);

      return "🗑 Задача удалена";
    }),
  };
}

function listTasks(deps: TasksDeps) {
  return defineTool({
    name: "list_tasks",
    progress: "Смотрю задачи…",
    description:
      "Tasks grouped by when they are due: overdue, today, upcoming (two weeks), later, notes without a date, and the ones done in the last 7 days.",
    parameters: z.strictObject({}),

    async run(context) {
      const groups = groupTasks(await deps.tasks.list(context.ownerId), context.now);
      const compact = (tasks: TaskView[]) =>
        tasks.slice(0, MAX_PER_GROUP).map((task) => compactTask(task, context.now));

      return {
        overdue: compact(groups.overdue),
        today: compact(groups.today),
        upcoming: compact(groups.upcoming),
        later: compact(groups.later),
        notes: compact(groups.notes),
        done: compact(groups.done),
      };
    },
  });
}

const scheduleFields = {
  dueDate: z
    .string()
    .nullable()
    .describe(
      "yyyy-MM-dd in the user's timezone; null for a note without a date. A repeating task starts at its first coming occurrence",
    ),
  dueTime: z
    .string()
    .nullable()
    .describe("HH:mm when the bot should remind; null for the whole day (reminded at 09:00)"),
  repeat: z.enum(REPEATS).describe("none, or how the task repeats"),
  repeatDays: z.array(z.number()).describe("For weekly: ISO weekdays 1-7 (Monday = 1)"),
};

function addTask(deps: TasksDeps) {
  return defineTool({
    name: "add_task",
    progress: "Записываю задачу…",
    description:
      "Adds a task right away: a reminder with a date and time (the bot reminds then), a to-do for a day, a repeating task, or a note without a date. Resolve «завтра», «в пятницу», «через 2 часа» against the current time.",
    parameters: z.strictObject({
      title: z
        .string()
        .describe("What to do, short, starting with a capital letter, e.g. «Позвонить в банк»"),
      note: z.string().describe("Details, or an empty string"),
      ...scheduleFields,
    }),

    async run(context, args) {
      const input = validate(createTaskSchema, {
        title: args.title.trim().slice(0, 200),
        note: args.note.trim(),
        dueDate: args.dueDate,
        dueTime: args.dueDate ? args.dueTime : null,
        repeat: args.repeat,
        repeatDays: args.repeatDays.map(Math.round),
      });

      checkNotPast(context, input);

      const task = await deps.tasks.create(context.ownerId, input, context.nextKey());
      const recorded = taskConfirmation(task, context.now);

      context.recorded.push(recorded);
      context.offer({
        kind: "undo",
        action: "undo_task",
        payload: { id: task.id, version: task.version },
        summary: recorded,
        label: task.title,
      });

      return { recorded, taskId: task.id };
    },
  });
}

function completeTask(deps: TasksDeps) {
  return defineTool({
    name: "complete_task",
    progress: "Отмечаю задачу…",
    description:
      "Marks a task from list_tasks done right away (the user can undo it). A repeating task moves on to its next date.",
    parameters: z.strictObject({ taskId: z.string() }),

    async run(context, args) {
      const task = await deps.tasks.complete(context.ownerId, checkId(args.taskId, "задача"));

      if (task.repeat !== "none" && task.dueDate) {
        const next = dueLabel(task.dueDate, task.dueTime, context.now);
        const recorded = `✅ Отмечено: ${task.title}. Следующий раз: ${next}`;
        context.recorded.push(recorded);

        return { recorded };
      }

      const recorded = `✅ Выполнено: ${task.title}`;

      context.recorded.push(recorded);
      context.offer({
        kind: "undo",
        action: "undo_complete",
        payload: { id: task.id, version: task.version },
        summary: recorded,
        label: task.title,
      });

      return { recorded };
    },
  });
}

function updateTask(deps: TasksDeps) {
  return defineTool({
    name: "update_task",
    progress: "Готовлю изменение…",
    description:
      "Changes a task from list_tasks: text, date, time, repeat. Nothing changes until the user taps «Подтвердить». Pass null for what stays the same; a new date keeps the time and a new time keeps the date.",
    parameters: z.strictObject({
      taskId: z.string(),
      title: z.string().nullable(),
      note: z.string().nullable(),
      dueDate: z.string().nullable().describe("New date yyyy-MM-dd, or null to keep"),
      dueTime: z.string().nullable().describe("New time HH:mm, or null to keep"),
      repeat: z.enum(REPEATS).nullable(),
      repeatDays: z.array(z.number()).nullable(),
      clearTime: z.boolean().describe("true to remind for the whole day instead of a time"),
      clearDate: z.boolean().describe("true to turn the task into a note without a date"),
    }),

    async run(context, args) {
      const current = await findTask(deps, context, args.taskId);

      const dueDate = args.clearDate ? null : (args.dueDate ?? current.dueDate);
      const keptTime = args.clearTime ? null : current.dueTime;
      const dueTime = dueDate ? (args.dueTime ?? keptTime) : null;
      const repeat = dueDate ? (args.repeat ?? current.repeat) : "none";

      const input = validate(updateTaskSchema, {
        title: (args.title ?? current.title).trim().slice(0, 200),
        note: (args.note ?? current.note).trim(),
        dueDate,
        dueTime,
        repeat,
        repeatDays: (args.repeatDays ?? current.repeatDays).map(Math.round),
        version: current.version,
      });

      checkNotPast(context, input);

      const changed = { ...current, ...input };
      const title = input.title === current.title ? "" : `, текст: «${input.title}»`;
      const summary = `Изменить задачу «${current.title}»: ${taskDue(current, context.now)} → ${taskDue(changed, context.now)}${title}?`;

      context.offer({
        kind: "confirm",
        action: "update_task",
        payload: { id: current.id, input },
        summary,
        label: current.title,
      });

      return { status: "waiting_for_confirmation", summary };
    },
  });
}

function deleteTask(deps: TasksDeps) {
  return defineTool({
    name: "delete_task",
    progress: "Готовлю удаление…",
    description:
      "Deletes a task or a note from list_tasks. Nothing is deleted until the user taps «Подтвердить».",
    parameters: z.strictObject({ taskId: z.string() }),

    async run(context, args) {
      const task = await findTask(deps, context, args.taskId);
      const summary = `Удалить задачу «${task.title}» (${taskDue(task, context.now)})?`;

      context.offer({
        kind: "confirm",
        action: "delete_task",
        payload: { id: task.id, version: task.version },
        summary,
        label: task.title,
      });

      return { status: "waiting_for_confirmation", summary };
    },
  });
}

async function findTask(deps: TasksDeps, context: ToolContext, id: string) {
  const tasks = await deps.tasks.list(context.ownerId);
  const task = tasks.find((item) => item.id === checkId(id, "задача"));
  if (!task) {
    throw new ToolError("Задача не найдена. Возьмите id из list_tasks");
  }

  return task;
}

/** A one-off reminder for a time that has already passed would never ring. */
function checkNotPast(
  context: ToolContext,
  input: { dueDate: string | null; dueTime: string | null; repeat: string },
) {
  if (input.repeat !== "none" || !input.dueDate || !input.dueTime) {
    return;
  }

  const remindAt = remindAtFor(input, context.timezone);
  if (remindAt && remindAt <= context.now.toJSDate()) {
    const when = dueLabel(input.dueDate, input.dueTime, context.now);

    throw new ToolError(`Это время уже прошло: ${when}. Уточните день и время`);
  }
}

function byDue(a: TaskView, b: TaskView) {
  const key = (task: TaskView) => `${task.dueDate ?? "9999"} ${task.dueTime ?? "99:99"}`;

  return key(a).localeCompare(key(b));
}

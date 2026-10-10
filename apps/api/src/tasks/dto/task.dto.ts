import { DateTime } from "luxon";
import { z } from "zod";
import { version } from "../../common/validation/schemas";
import { REPEATS } from "../recurrence";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TITLE = 200;
const MAX_NOTE = 2000;
const SUNDAY = 7;

const dueDate = z
  .string()
  .refine((value) => DateTime.fromISO(value).isValid && value.length === 10, "Неверная дата");

const taskFields = z
  .object({
    title: z.string().trim().min(1, "Введите текст задачи").max(MAX_TITLE),
    note: z.string().trim().max(MAX_NOTE).default(""),
    dueDate: dueDate.nullable().default(null),
    dueTime: z.string().regex(TIME, "Неверное время").nullable().default(null),
    repeat: z.enum(REPEATS).default("none"),
    repeatDays: z.array(z.number().int().min(1).max(SUNDAY)).max(SUNDAY).default([]),
  })
  .strict();

type TaskFields = z.infer<typeof taskFields>;

/** A time needs a date; a repeat needs a date and, for weekly, at least one day. */
function checkSchedule(task: TaskFields, context: z.RefinementCtx) {
  if (task.dueTime && !task.dueDate) {
    context.addIssue({ code: "custom", path: ["dueDate"], message: "Укажите дату" });
  }

  if (task.repeat !== "none" && !task.dueDate) {
    context.addIssue({ code: "custom", path: ["dueDate"], message: "Для повтора нужна дата" });
  }

  if (task.repeat === "weekly" && task.repeatDays.length === 0) {
    context.addIssue({ code: "custom", path: ["repeatDays"], message: "Выберите дни недели" });
  }
}

export const createTaskSchema = taskFields.superRefine(checkSchedule);

export const updateTaskSchema = taskFields.extend({ version }).strict().superRefine(checkSchedule);

export const versionSchema = z.object({ version }).strict();

export type CreateTaskDto = z.infer<typeof createTaskSchema>;
export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;
export type VersionDto = z.infer<typeof versionSchema>;

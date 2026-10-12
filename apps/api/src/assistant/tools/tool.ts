import { DateTime } from "luxon";
import { z as zod3 } from "zod";
import { z } from "zod/v4";
import { ToolSpec } from "../assistant-model";

/** A photo from the chat: the biggest size for recognition and a small one for the diary list. */
export type ChatPhoto = { full: Buffer; thumbnail: Buffer };

/**
 * A button under the answer. "confirm" runs a change only after the tap; "undo" reverts a record
 * that was already made. `action` names the handler, `payload` is what it gets.
 */
export type Offer = {
  kind: "confirm" | "undo";
  action: string;
  payload: Record<string, unknown>;
  /** The full question or record, e.g. "Удалить расход 45 000 сум · Кафе · вчера?". */
  summary: string;
  /** A few words for the button when the answer has several. */
  label: string;
};

/** What a tool knows about the turn besides its arguments. The model never sets these. */
export type ToolContext = {
  ownerId: string;
  timezone: string;
  /** Current time in the owner's timezone. */
  now: DateTime;
  /** The photo attached to the message, if any. */
  photo: ChatPhoto | null;
  /** A new idempotency key for the next record of this turn. */
  nextKey(): string;
  /** Adds a button under the answer. */
  offer(offer: Offer): void;
  /** What was recorded in this turn; shown even if the model fails before answering. */
  recorded: string[];
};

export type AssistantTool = {
  name: string;
  /** What the chat shows while the tool runs, e.g. "Ищу операции…". */
  progress: string;
  description: string;
  parameters: z.ZodObject;
  run(context: ToolContext, args: unknown): Promise<unknown>;
};

/** Runs a confirmed change or an undo; returns the outcome for the chat, e.g. "🗑 Удалено". */
export type ActionHandler = (ownerId: string, payload: Record<string, unknown>) => Promise<string>;

/** Tools of one area and the handlers of the buttons they offer. */
export type Toolset = { tools: AssistantTool[]; actions: Record<string, ActionHandler> };

/** A mistake in the arguments: the message goes back to the model, which can fix it or ask. */
export class ToolError extends Error {}

/** Keeps `run` typed by its schema. */
export function defineTool<S extends z.ZodObject>(tool: {
  name: string;
  progress: string;
  description: string;
  parameters: S;
  run(context: ToolContext, args: z.infer<S>): Promise<unknown>;
}): AssistantTool {
  return tool as AssistantTool;
}

/** Keeps the payload typed in the handler; the payload is written by our own tools. */
export function defineAction<P>(run: (ownerId: string, payload: P) => Promise<string>) {
  return run as unknown as ActionHandler;
}

/** The tool for the model: name, description and a strict JSON Schema of the arguments. */
export function toolSpec(tool: AssistantTool): ToolSpec {
  const { $schema: _dialect, ...schema } = z.toJSONSchema(tool.parameters, {
    target: "draft-7",
  });

  return { name: tool.name, description: tool.description, parameters: withRequired(schema) };
}

/** Strict function calling wants `required` on every object, even an empty one. */
function withRequired(schema: Record<string, unknown>) {
  if (schema.type === "object" && schema.properties && !schema.required) {
    schema.required = Object.keys(schema.properties);
  }

  return schema;
}

/** Checks a request against the app's own DTO schema; the first problem goes to the model. */
export function validate<T>(schema: zod3.ZodType<T, zod3.ZodTypeDef, unknown>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ToolError(result.error.issues[0]?.message ?? "Неверные данные");
  }

  return result.data;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A past day without a time is put in the middle of it. */
const DEFAULT_HOUR = 12;

/**
 * The moment of a record from the model's date and time in the owner's timezone: now when
 * neither is given, today for a time alone, midday for a past day without a time.
 */
export function momentOf(context: ToolContext, date: string | null, time: string | null) {
  if (date !== null && !DATE.test(date)) {
    throw new ToolError("Дата должна быть в формате yyyy-MM-dd");
  }

  if (time !== null && !TIME.test(time)) {
    throw new ToolError("Время должно быть в формате HH:mm");
  }

  const today = context.now.toISODate()!;
  const day = date ?? today;

  if (time) {
    const [hour, minute] = time.split(":").map(Number);

    return DateTime.fromISO(day, { zone: context.timezone }).set({ hour, minute });
  }

  if (day === today) {
    return context.now;
  }

  return DateTime.fromISO(day, { zone: context.timezone }).set({ hour: DEFAULT_HOUR });
}

/** Rejects a moment in the future: records are about what already happened. */
export function pastMoment(context: ToolContext, date: string | null, time: string | null) {
  const moment = momentOf(context, date, time);
  if (!moment.isValid) {
    throw new ToolError("Неверная дата");
  }

  if (moment > context.now.plus({ minutes: 1 })) {
    throw new ToolError("Это время ещё не наступило. Записать можно только то, что уже было");
  }

  return moment;
}

/** The day the model named (yyyy-MM-dd), or today in the owner's timezone. */
export function dayOf(context: ToolContext, date: string | null) {
  if (date === null) {
    return context.now.toISODate()!;
  }

  if (!DATE.test(date) || !DateTime.fromISO(date).isValid) {
    throw new ToolError("Дата должна быть в формате yyyy-MM-dd");
  }

  return date;
}

/** yyyy-MM in the owner's timezone; the current month when not given. */
export function monthOf(context: ToolContext, month: string | null) {
  return month ?? context.now.toFormat("yyyy-MM");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id the model took from a tool result; anything else is refused before the database. */
export function checkId(id: string, what: string) {
  if (!UUID.test(id)) {
    throw new ToolError(`Неизвестный id: ${what}. Найдите его инструментом`);
  }

  return id;
}

/** Common argument schemas, described for the model. */
export const fields = {
  date: z.string().nullable().describe("yyyy-MM-dd in the user's timezone; null for today"),
  time: z.string().nullable().describe("HH:mm, 24-hour; null when not said"),
  month: z.string().nullable().describe("yyyy-MM; null for the current month"),
  note: z.string().describe("What it was for, 1-5 lowercase words, e.g. «обед», «такси до дома»"),
};

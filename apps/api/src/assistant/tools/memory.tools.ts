import { z } from "zod/v4";
import { MemoryService } from "../memory.service";
import { AssistantSettingsService } from "../settings.service";
import { checkId, defineAction, defineTool, ToolError, Toolset } from "./tool";

export type MemoryDeps = {
  memory: Pick<MemoryService, "add" | "remove">;
  settings: Pick<AssistantSettingsService, "update">;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const OFF = "off";

/** What the assistant remembers about the person, and its own settings. */
export function memoryTools(deps: MemoryDeps): Toolset {
  return {
    tools: [remember(deps), forget(deps), updateSettings(deps)],
    actions: {
      undo_memory: defineAction<{ id: string }>(async (ownerId, payload) => {
        await deps.memory.remove(ownerId, payload.id);

        return "↩️ Забыл";
      }),
    },
  };
}

function remember(deps: MemoryDeps) {
  return defineTool({
    name: "remember",
    progress: "Запоминаю…",
    description:
      "Saves a lasting fact or preference about the user for future conversations, e.g. «Такси — всегда категория Транспорт», «Не ест сахар». Only when the user asks to remember or states a lasting preference. Never passwords, card numbers or other secrets.",
    parameters: z.strictObject({
      fact: z.string().describe("One short self-contained sentence in Russian"),
    }),

    async run(context, args) {
      const fact = await deps.memory.add(context.ownerId, args.fact);
      const recorded = `🧠 Запомнил: ${fact.text}`;

      context.recorded.push(recorded);
      context.offer({
        kind: "undo",
        action: "undo_memory",
        payload: { id: fact.id },
        summary: recorded,
        label: "забыть",
      });

      return { recorded, memoryId: fact.id };
    },
  });
}

function forget(deps: MemoryDeps) {
  return defineTool({
    name: "forget",
    progress: "Забываю…",
    description:
      "Removes a fact from the memory listed in the context, when the user asks to forget it.",
    parameters: z.strictObject({ memoryId: z.string() }),

    async run(context, args) {
      const fact = await deps.memory.remove(context.ownerId, checkId(args.memoryId, "факт"));
      const recorded = `Забыл: ${fact.text}`;

      context.recorded.push(recorded);

      return { recorded };
    },
  });
}

function updateSettings(deps: MemoryDeps) {
  return defineTool({
    name: "update_assistant_settings",
    progress: "Меняю настройки…",
    description:
      "Turns the bot's own messages on or off: the morning brief (tasks, budget, subscriptions, calories) at a chosen time, and the weekly report on Sunday evening. Pass null for what stays the same.",
    parameters: z.strictObject({
      morningBrief: z
        .string()
        .nullable()
        .describe(`"HH:mm" to send the brief at that time, "${OFF}" to stop it, null to keep`),
      weeklyReport: z.boolean().nullable().describe("true to send, false to stop, null to keep"),
    }),

    async run(context, args) {
      const changes: { morningBriefAt?: string | null; weeklyReport?: boolean } = {};

      if (args.morningBrief !== null) {
        changes.morningBriefAt = briefTime(args.morningBrief);
      }

      if (args.weeklyReport !== null) {
        changes.weeklyReport = args.weeklyReport;
      }

      const settings = await deps.settings.update(context.ownerId, changes);
      const brief = settings.morningBriefAt ? `в ${settings.morningBriefAt}` : "выключена";
      const report = settings.weeklyReport ? "включён" : "выключен";
      const recorded = `Утренняя сводка ${brief}, недельный отчёт ${report}`;

      context.recorded.push(recorded);

      return { recorded };
    },
  });
}

function briefTime(value: string) {
  if (value === OFF) {
    return null;
  }

  if (!TIME.test(value)) {
    throw new ToolError(`Время сводки — в формате HH:mm, или "${OFF}", чтобы выключить`);
  }

  return value;
}

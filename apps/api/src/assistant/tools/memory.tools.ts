import { z } from "zod/v4";
import { MemoryService } from "../memory.service";
import {
  AssistantSettingsService,
  AssistantSettingsView,
  weatherPlaceOf,
} from "../settings.service";
import { checkId, defineAction, defineTool, ToolError, Toolset } from "./tool";

export type MemoryDeps = {
  memory: Pick<MemoryService, "add" | "remove">;
  settings: Pick<AssistantSettingsService, "update">;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const OFF = "off";
const MAX_PLACE_LENGTH = 100;

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
      "Changes the bot's own messages: the morning brief (today's weather, tasks, budget, subscriptions, calories) and the evening brief (the day's spending and calories, tomorrow's weather, tasks and subscriptions) at chosen times, the weather in them and its city, and the weekly report on Sunday evening. Pass null for what stays the same.",
    parameters: z.strictObject({
      morningBrief: z
        .string()
        .nullable()
        .describe(
          `"HH:mm" to send the morning brief at that time, "${OFF}" to stop it, null to keep`,
        ),
      eveningBrief: z
        .string()
        .nullable()
        .describe(
          `"HH:mm" to send the evening brief at that time, "${OFF}" to stop it, null to keep`,
        ),
      weeklyReport: z.boolean().nullable().describe("true to send, false to stop, null to keep"),
      briefWeather: z
        .boolean()
        .nullable()
        .describe(
          "true to show the weather of the day in the brief, false to hide it, null to keep",
        ),
      weatherPlace: z
        .string()
        .nullable()
        .describe("City of the weather in the briefs, e.g. «Самарканд»; null to keep"),
    }),

    async run(context, args) {
      const changes: Partial<AssistantSettingsView> = {};

      if (args.morningBrief !== null) {
        changes.morningBriefAt = briefTime(args.morningBrief);
      }

      if (args.eveningBrief !== null) {
        changes.eveningBriefAt = briefTime(args.eveningBrief);
      }

      if (args.weeklyReport !== null) {
        changes.weeklyReport = args.weeklyReport;
      }

      if (args.briefWeather !== null) {
        changes.briefWeather = args.briefWeather;
      }

      if (args.weatherPlace !== null) {
        changes.weatherPlace = placeName(args.weatherPlace);
      }

      const settings = await deps.settings.update(context.ownerId, changes);
      const recorded = settingsSummary(settings, context.timezone);

      context.recorded.push(recorded);

      return { recorded };
    },
  });
}

/** "Утренняя сводка в 08:00, вечерняя в 21:00, погода в них: Ташкент, недельный отчёт включён". */
function settingsSummary(settings: AssistantSettingsView, timezone: string) {
  const at = (time: string | null) => (time ? `в ${time}` : "выключена");
  const weather = settings.briefWeather ? weatherPlaceOf(settings, timezone) : "выключена";
  const report = settings.weeklyReport ? "включён" : "выключен";

  return `Утренняя сводка ${at(settings.morningBriefAt)}, вечерняя ${at(settings.eveningBriefAt)}, погода в них: ${weather}, недельный отчёт ${report}`;
}

function placeName(value: string) {
  const place = value.trim().slice(0, MAX_PLACE_LENGTH);
  if (!place) {
    throw new ToolError("Назовите город для погоды");
  }

  return place;
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

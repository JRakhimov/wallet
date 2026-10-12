import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { Owner } from "@prisma/client";
import { DateTime } from "luxon";
import { OwnerService } from "../owner/owner.service";
import { SPEECH_TO_TEXT, SpeechToText } from "../voice/speech-to-text";
import { ActionsService, SavedOffer } from "./actions.service";
import {
  ASSISTANT_MODEL,
  AssistantModel,
  AssistantModelError,
  ModelCall,
  TurnItem,
} from "./assistant-model";
import { HistoryService } from "./history.service";
import { MemoryService } from "./memory.service";
import { contextNote, SYSTEM_PROMPT } from "./prompt";
import { AssistantSettingsService } from "./settings.service";
import { AssistantToolbox } from "./tools/toolbox";
import { ChatPhoto, Offer, ToolContext, ToolError } from "./tools/tool";

/** A failure whose message can be sent to the chat as is. */
export class AssistantError extends Error {}

export type AssistantStage = "recognizing" | "thinking";

export type ChatInput = {
  telegramId: bigint;
  /** Typed text or the caption of a photo. */
  text: string;
  audio: { data: Buffer; filename: string } | null;
  photo: ChatPhoto | null;
  /** Unique per Telegram update: makes the records of this message idempotent. */
  key: string;
  /** Called when the work moves on, so the chat can show progress. */
  onStage?: (stage: AssistantStage) => Promise<void>;
};

export type ReplyButton = { text: string; data: string };

export type AssistantReply = { text: string; buttons: ReplyButton[][] };

/** Tool calls in one turn; a model that loops is stopped here. */
const MAX_STEPS = 8;
/** Turns a day per user: keeps the bill predictable when access is shared. */
const DAILY_LIMIT = 200;
const MAX_TEXT = 4000;
const MAX_LABEL = 24;

const NOT_CONFIGURED_TEXT = "Ассистент не настроен на сервере";
const NO_SPEECH_TEXT = "Распознавание голоса не настроено на сервере";
const UNRECOGNIZED_TEXT = "Не удалось разобрать речь. Попробуйте записать ещё раз";
const LIMIT_TEXT = "На сегодня лимит сообщений ассистенту исчерпан. Продолжим завтра";
const EMPTY_TEXT = "Напишите, что нужно сделать или узнать";
const NO_ANSWER_TEXT = "Не получилось ответить. Попробуйте сформулировать иначе";
const INTERNAL_ERROR = "Внутренняя ошибка. Попробуйте позже";

/**
 * The assistant in the bot chat: a message (text, voice or photo) goes to the language model
 * with tools over every app; the model reads and records through them and answers.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    @Inject(ASSISTANT_MODEL) private readonly model: AssistantModel | null,
    @Inject(SPEECH_TO_TEXT) private readonly speech: SpeechToText | null,
    private readonly owners: OwnerService,
    private readonly toolbox: AssistantToolbox,
    private readonly history: HistoryService,
    private readonly memory: MemoryService,
    private readonly settings: AssistantSettingsService,
    private readonly actions: ActionsService,
  ) {}

  get enabled() {
    return Boolean(this.model);
  }

  async reply(input: ChatInput): Promise<AssistantReply> {
    if (!this.model) {
      throw new AssistantError(NOT_CONFIGURED_TEXT);
    }

    const userText = await this.userText(input);

    await input.onStage?.("thinking");

    const owner = await this.owners.ensureOwner(input.telegramId);
    const now = DateTime.now().setZone(owner.timezone);

    await this.checkDailyLimit(owner.id, now);

    const offers: Offer[] = [];
    const context = this.toolContext(owner, now, input, offers);
    const past = await this.pastItems(owner.id, now, Boolean(input.photo));
    const turn: TurnItem[] = [
      {
        type: "user",
        text: userText,
        ...(input.photo && { image: input.photo.full.toString("base64") }),
      },
    ];

    const answer = await this.converse(this.model, past, turn, context);
    // Without an answer the records, or at least the questions with buttons, speak for it.
    const text = answer || context.recorded.join("\n") || (offers.length > 0 ? "" : NO_ANSWER_TEXT);

    if (text) {
      turn.push({ type: "assistant", text });
    }

    await this.history.save(owner.id, turn);

    const saved = await this.actions.save(owner.id, offers);

    return composeReply(text, saved);
  }

  /** A tap on a button under an answer. */
  resolveAction(telegramId: bigint, actionId: string, approve: boolean) {
    return this.actions.resolve(telegramId, actionId, approve);
  }

  /** /new: the conversation starts over; the memory stays. */
  async restartChat(telegramId: bigint) {
    const owner = await this.owners.ensureOwner(telegramId);

    await this.settings.restartChat(owner.id);
  }

  private async userText(input: ChatInput) {
    if (input.audio) {
      return this.transcribe(input);
    }

    const text = input.text.trim().slice(0, MAX_TEXT);
    if (text) {
      return text;
    }

    if (input.photo) {
      return "(фото без подписи)";
    }

    throw new AssistantError(EMPTY_TEXT);
  }

  private async transcribe(input: ChatInput) {
    if (!this.speech) {
      throw new AssistantError(NO_SPEECH_TEXT);
    }

    await input.onStage?.("recognizing");

    const text = await this.speech.transcribe(input.audio!.data, input.audio!.filename);
    if (!text) {
      throw new AssistantError(UNRECOGNIZED_TEXT);
    }

    return `[Голосовое сообщение] ${text}`;
  }

  private async checkDailyLimit(ownerId: string, now: DateTime) {
    const count = await this.history.countSince(ownerId, now.startOf("day").toJSDate());
    if (count >= DAILY_LIMIT) {
      throw new AssistantError(LIMIT_TEXT);
    }
  }

  /** The recent conversation and a note with the time, the settings and the memory. */
  private async pastItems(ownerId: string, now: DateTime, hasPhoto: boolean) {
    const settings = await this.settings.get(ownerId);

    const [history, memory] = await Promise.all([
      this.history.recent(ownerId, settings.historyFrom),
      this.memory.list(ownerId),
    ]);

    const note: TurnItem = {
      type: "note",
      text: contextNote({ now, settings, memory, hasPhoto }),
    };

    return [...history, note];
  }

  private toolContext(owner: Owner, now: DateTime, input: ChatInput, offers: Offer[]) {
    let records = 0;

    const context: ToolContext = {
      ownerId: owner.id,
      timezone: owner.timezone,
      now,
      photo: input.photo,
      nextKey: () => `${input.key}-${++records}`,
      offer: (offer) => offers.push(offer),
      recorded: [],
    };

    return context;
  }

  /** Lets the model call tools until it answers. Returns "" when it gives no answer. */
  private async converse(
    model: AssistantModel,
    past: TurnItem[],
    turn: TurnItem[],
    context: ToolContext,
  ) {
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const answer = await model.respond({
          instructions: SYSTEM_PROMPT,
          items: [...past, ...turn],
          tools: this.toolbox.tools.specs,
        });

        if (answer.calls.length === 0) {
          return answer.text;
        }

        if (answer.text) {
          turn.push({ type: "assistant", text: answer.text });
        }

        await this.runCalls(answer.calls, turn, context);
      }

      this.logger.warn("The assistant reached the step limit");

      return "";
    } catch (error) {
      if (!(error instanceof AssistantModelError)) {
        throw error;
      }

      this.logger.warn(`Assistant model failed: ${error.status ?? "no status"}`);

      // What was already recorded is reported instead of the answer.
      if (context.recorded.length > 0) {
        return "";
      }

      throw new AssistantError(error.message);
    }
  }

  /** Runs the calls one by one: records keep their order and their idempotency keys. */
  private async runCalls(calls: ModelCall[], turn: TurnItem[], context: ToolContext) {
    const results: TurnItem[] = [];

    for (const call of calls) {
      results.push({
        type: "result",
        callId: call.callId,
        output: await this.runTool(call, context),
      });
    }

    turn.push(...calls.map((call) => ({ type: "call" as const, ...call })), ...results);
  }

  /** The tool's result as JSON; a mistake goes back to the model as `{ error }`. */
  private async runTool(call: ModelCall, context: ToolContext) {
    const tool = this.toolbox.tools.tools.get(call.name);
    if (!tool) {
      return JSON.stringify({ error: `Нет инструмента ${call.name}` });
    }

    try {
      const args = tool.parameters.safeParse(JSON.parse(call.arguments));
      if (!args.success) {
        return JSON.stringify({ error: `Неверные аргументы: ${args.error.message}` });
      }

      const result = await tool.run(context, args.data);

      return JSON.stringify(result ?? { ok: true });
    } catch (error) {
      return JSON.stringify({ error: this.toolErrorMessage(call.name, error) });
    }
  }

  private toolErrorMessage(tool: string, error: unknown) {
    if (error instanceof ToolError || error instanceof HttpException) {
      return error.message;
    }

    if (error instanceof SyntaxError) {
      return "Аргументы должны быть JSON";
    }

    this.logger.error(`Tool ${tool} failed: ${error instanceof Error ? error.name : "unknown"}`);

    return INTERNAL_ERROR;
  }
}

/** The answer, the changes waiting for confirmation and the buttons under them. */
function composeReply(text: string, offers: SavedOffer[]): AssistantReply {
  const confirms = offers.filter((offer) => offer.kind === "confirm");
  const undos = offers.filter((offer) => offer.kind === "undo");
  const many = confirms.length > 1;

  const questions = many
    ? ["Ждут подтверждения:", ...confirms.map((offer, index) => `${index + 1}. ${offer.summary}`)]
    : confirms.map((offer) => `❓ ${offer.summary}`);

  const confirmRows = confirms.map((offer, index) => [
    { text: many ? `✅ ${index + 1}` : "✅ Подтвердить", data: `act:${offer.id}` },
    { text: many ? `✖️ ${index + 1}` : "✖️ Отмена", data: `act-no:${offer.id}` },
  ]);

  const undoRows = undos.map((offer) => [
    {
      text: undos.length > 1 ? `↩️ Отменить: ${shorten(offer.label)}` : "↩️ Отменить",
      data: `act:${offer.id}`,
    },
  ]);

  return {
    text: [text, questions.join("\n")].filter(Boolean).join("\n\n"),
    buttons: [...confirmRows, ...undoRows],
  };
}

function shorten(label: string) {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;
}

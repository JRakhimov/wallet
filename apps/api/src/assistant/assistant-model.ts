import OpenAI from "openai";
import { AssistantConfig } from "../config/app-config";

/**
 * One item of the dialog in a provider-neutral form: it is what the history stores, and each
 * model implementation converts it into its own API's messages.
 */
export type TurnItem =
  /** `image` is a base64 JPEG; it is sent only in the current turn and never stored. */
  | { type: "user"; text: string; image?: string }
  | { type: "assistant"; text: string }
  | { type: "call"; callId: string; name: string; arguments: string }
  | { type: "result"; callId: string; output: string }
  /** What the model should know from the server: the current time, a tapped button. */
  | { type: "note"; text: string };

/** A function the model may call; `parameters` is a strict JSON Schema. */
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

export type ModelCall = { callId: string; name: string; arguments: string };

/** The model either answers (`calls` is empty) or asks to run tools first. */
export type ModelAnswer = { text: string; calls: ModelCall[] };

export type ModelRequest = {
  instructions: string;
  items: TurnItem[];
  tools: ToolSpec[];
  /** Aborts the request when the user stops the answer. */
  signal?: AbortSignal;
  /** Gets the answer as it is written: the whole text so far, each time it grows. */
  onText?: (text: string) => void;
};

/** The language model behind the assistant; replaceable, e.g. by a fake in tests. */
export interface AssistantModel {
  respond(request: ModelRequest): Promise<ModelAnswer>;
}

/** DI token; null is injected when no API key is configured. */
export const ASSISTANT_MODEL = Symbol("ASSISTANT_MODEL");

/** A failure whose message can be shown in the chat as is; `status` is for the logs. */
export class AssistantModelError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** The user stopped the answer before it was ready. */
export class AssistantStoppedError extends Error {}

const TIMEOUT_MS = 90_000;
/** Answers are short; the margin is for reasoning models, whose thinking counts here too. */
const MAX_OUTPUT_TOKENS = 8000;

type InputItem = OpenAI.Responses.ResponseInputItem;

/** OpenAI Responses API with function calling. Nothing is stored on OpenAI's side. */
export class OpenAiAssistantModel implements AssistantModel {
  private readonly client: OpenAI;

  constructor(private readonly config: AssistantConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey, timeout: TIMEOUT_MS, maxRetries: 2 });
  }

  async respond(request: ModelRequest): Promise<ModelAnswer> {
    let response: OpenAI.Responses.Response;

    try {
      response = await this.stream(request);
    } catch (error) {
      if (request.signal?.aborted) {
        throw new AssistantStoppedError();
      }

      if (error instanceof OpenAI.APIError) {
        throw new AssistantModelError(errorMessage(error.status), error.status);
      }

      throw error;
    }

    const calls = response.output
      .filter((item) => item.type === "function_call")
      .map((call) => ({ callId: call.call_id, name: call.name, arguments: call.arguments }));

    return { text: response.output_text.trim(), calls };
  }

  /** Streams the response, so the chat can show the answer while it is written. */
  private async stream(request: ModelRequest) {
    const stream = this.client.responses.stream(
      {
        model: this.config.model,
        instructions: request.instructions,
        input: request.items.map(inputItem),
        tools: request.tools.map(functionTool),
        max_output_tokens: MAX_OUTPUT_TOKENS,
        store: false,
      },
      { signal: request.signal },
    );

    let text = "";

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        text += event.delta;
        request.onText?.(text);
      }
    }

    return stream.finalResponse();
  }
}

function inputItem(item: TurnItem): InputItem {
  switch (item.type) {
    case "user":
      return { role: "user", content: userContent(item.text, item.image) };

    case "assistant":
      return { role: "assistant", content: item.text };

    case "call":
      return {
        type: "function_call",
        call_id: item.callId,
        name: item.name,
        arguments: item.arguments,
      };

    case "result":
      return { type: "function_call_output", call_id: item.callId, output: item.output };

    case "note":
      return { role: "developer", content: item.text };
  }
}

function userContent(text: string, image: string | undefined) {
  const content: OpenAI.Responses.ResponseInputMessageContentList = [{ type: "input_text", text }];

  if (image) {
    content.push({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${image}`,
      detail: "auto",
    });
  }

  return content;
}

function functionTool(tool: ToolSpec): OpenAI.Responses.FunctionTool {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: true,
  };
}

function errorMessage(status: number | undefined) {
  if (status === 401 || status === 403) {
    return "Ключ API ассистента недействителен. Проверьте настройки сервера";
  }

  if (status === 429) {
    return "Слишком много запросов к модели. Попробуйте через минуту";
  }

  if (status !== undefined && status >= 500) {
    return "Модель временно недоступна. Попробуйте ещё раз";
  }

  return "Не удалось получить ответ. Попробуйте ещё раз";
}

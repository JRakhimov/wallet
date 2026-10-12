import { Logger } from "@nestjs/common";
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

/** A web page the answer relies on. */
export type Source = { title: string; url: string };

/** The model either answers (`calls` is empty) or asks to run tools first. */
export type ModelAnswer = { text: string; calls: ModelCall[]; sources: Source[] };

export type ModelRequest = {
  instructions: string;
  items: TurnItem[];
  tools: ToolSpec[];
  /** Aborts the request when the user stops the answer. */
  signal?: AbortSignal;
  /** Gets the answer as it is written: the whole text so far, each time it grows. */
  onText?: (text: string) => void;
  /** Lets the model search the web, for searches near the user. */
  webSearch?: { timezone: string };
  /** Called when the model starts searching the web. */
  onSearch?: () => void;
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

/**
 * Links OpenAI puts into the text where it cites a page, e.g.
 * " ([afisha.uz](https://…?utm_source=openai))". The pages are listed under the answer anyway.
 */
const CITATION_LINK = String.raw`\[[^\]\n]*\]\([^)\s]*utm_source=openai[^)\s]*\)`;
const INLINE_CITATIONS = new RegExp(
  String.raw`\s*\((?:\s*${CITATION_LINK},?)+\s*\)|\s*${CITATION_LINK}`,
  "g",
);

/** A link at the end of a text still being written: it may turn out to be a citation. */
const LINK_IN_PROGRESS = /\s*\(?\[[^\]\n]*(\]\([^)\s]*)?$/;

/** OpenAI Responses API with function calling. Nothing is stored on OpenAI's side. */
export class OpenAiAssistantModel implements AssistantModel {
  private readonly client: OpenAI;
  private readonly logger = new Logger(OpenAiAssistantModel.name);
  /** Turned off for good when the model refuses the web search tool. */
  private webSearchWorks = true;

  constructor(private readonly config: AssistantConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey, timeout: TIMEOUT_MS, maxRetries: 2 });
  }

  async respond(request: ModelRequest): Promise<ModelAnswer> {
    let response: OpenAI.Responses.Response;

    try {
      response = await this.streamWithFallback(request);
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

    return {
      text: withoutCitations(response.output_text).trim(),
      calls,
      sources: sourcesOf(response.output),
    };
  }

  /**
   * A model without web search refuses the whole request; then the assistant goes on without
   * it rather than stop answering.
   */
  private async streamWithFallback(request: ModelRequest) {
    const webSearch = this.webSearchWorks ? request.webSearch : undefined;

    try {
      return await this.stream(request, webSearch);
    } catch (error) {
      if (!webSearch || !isWebSearchRefusal(error)) {
        throw error;
      }

      this.webSearchWorks = false;
      this.logger.warn(`${this.config.model} does not support web search; it is turned off`);

      return this.stream(request, undefined);
    }
  }

  /** Streams the response, so the chat can show the answer while it is written. */
  private async stream(request: ModelRequest, webSearch: ModelRequest["webSearch"]) {
    const tools: OpenAI.Responses.Tool[] = request.tools.map(functionTool);

    if (webSearch) {
      tools.push({
        type: "web_search",
        user_location: { type: "approximate", timezone: webSearch.timezone },
      });
    }

    const stream = this.client.responses.stream(
      {
        model: this.config.model,
        instructions: request.instructions,
        input: request.items.map(inputItem),
        tools,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        store: false,
      },
      { signal: request.signal },
    );

    let text = "";

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        text += event.delta;

        const shown = withoutCitations(text).replace(LINK_IN_PROGRESS, "");
        request.onText?.(shown);
      }

      if (event.type === "response.web_search_call.searching") {
        request.onSearch?.();
      }
    }

    return stream.finalResponse();
  }
}

/** The pages the answer cites, each once. */
export function sourcesOf(output: OpenAI.Responses.ResponseOutputItem[]) {
  const sources = new Map<string, Source>();

  for (const item of output) {
    if (item.type !== "message") {
      continue;
    }

    for (const part of item.content) {
      if (part.type !== "output_text") {
        continue;
      }

      for (const annotation of part.annotations) {
        if (annotation.type !== "url_citation") {
          continue;
        }

        const url = withoutTracking(annotation.url);

        if (!sources.has(url)) {
          sources.set(url, { title: annotation.title, url });
        }
      }
    }
  }

  return [...sources.values()];
}

/** The text without the links OpenAI puts in where it cites a page. */
export function withoutCitations(text: string) {
  return text.replace(INLINE_CITATIONS, "");
}

/** The URL without the parameter OpenAI adds to the pages it cites. */
function withoutTracking(url: string) {
  try {
    const parsed = new URL(url);

    if (parsed.searchParams.get("utm_source") === "openai") {
      parsed.searchParams.delete("utm_source");
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

/** A 400 that names the web search tool: the model does not have it. */
function isWebSearchRefusal(error: unknown) {
  return (
    error instanceof OpenAI.APIError && error.status === 400 && /web.?search/i.test(error.message)
  );
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

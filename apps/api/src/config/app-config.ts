import { resolve } from "node:path";

export const CONFIG = Symbol("APP_CONFIG");

export const LLM_PROVIDERS = ["claude", "gemini", "openai"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

/** LLM used to recognize meals; null when the provider's API key is not set. */
export type LlmConfig = { provider: LlmProvider; model: string; apiKey: string };

const LLM_API_KEY_ENV: Record<LlmProvider, string> = {
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
};
// Only Claude has a default model; other providers need NUTRITION_LLM_MODEL.
const DEFAULT_LLM_MODEL: Partial<Record<LlmProvider, string>> = { claude: "claude-opus-5-5" };
const DEFAULT_PHOTO_DIR = "data/photos";

/** Speech recognition for voice messages; null when OPENAI_API_KEY is not set. */
export type VoiceConfig = {
  apiKey: string;
  /** Set to use a self-hosted OpenAI-compatible Whisper server instead of OpenAI. */
  transcriptionBaseUrl: string | undefined;
  transcriptionModel: string;
};

/** The chat assistant in the bot; null when OPENAI_API_KEY is not set. */
export type AssistantConfig = { apiKey: string; model: string };

const DEFAULT_ASSISTANT_MODEL = "gpt-6-luna";

/** MCP clients (Home Assistant and the like) connect to /api/mcp/<secret>; null turns it off. */
export type McpConfig = { secret: string };

/** Telegram pushes updates to `url`, signed with `secret` in a header. */
export type WebhookConfig = { url: string; secret: string };

/** Webhook and MCP secrets: long enough not to be guessed, safe in a URL and a header. */
const WEBHOOK_SECRET = /^[A-Za-z0-9_-]{32,256}$/;

export interface AppConfig {
  env: string;
  dev: boolean;
  host: string;
  port: number;
  origin: string;
  allowedOrigins: string[];
  botToken: string;
  ownerTelegramId: bigint;
  /** Long-poll Telegram even in dev mode (BOT_IN_DEV=true). Off by default so a local API never competes with the deployed bot for updates. */
  botInDev: boolean;
  /** Webhook mode when TELEGRAM_WEBHOOK_URL is set; long polling otherwise. */
  webhook: WebhookConfig | null;
  miniAppUrl: string;
  /** Nutrition Mini App URL for the bot's /start buttons; empty when not deployed. */
  nutritionAppUrl: string;
  /** Tasks Mini App URL for the bot's buttons; empty when not deployed. */
  tasksAppUrl: string;
  voice: VoiceConfig | null;
  assistant: AssistantConfig | null;
  mcp: McpConfig | null;
  nutrition: {
    llm: LlmConfig | null;
    /** Absolute folder for meal photos (PhotoStorage on disk). */
    photoDir: string;
  };
}

const AUTH_MODES = ["dev", "telegram"];
const DEFAULT_ORIGIN = "http://localhost:5173";

/** Reads and validates environment variables. Throws on invalid configuration. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV || "production";
  const mode = env.AUTH_MODE || "telegram";
  if (!AUTH_MODES.includes(mode)) {
    throw new Error("AUTH_MODE must be dev or telegram");
  }
  const dev = mode === "dev";
  if (dev && nodeEnv !== "development") {
    throw new Error("AUTH_MODE=dev requires NODE_ENV=development");
  }

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const listedOrigins = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const originUrl = new URL(env.APP_ORIGIN || listedOrigins[0] || DEFAULT_ORIGIN);
  if (nodeEnv === "production" && originUrl.protocol !== "https:") {
    throw new Error("Production requires HTTPS APP_ORIGIN");
  }
  const allowedOrigins = listedOrigins.length
    ? listedOrigins
    : [originUrl.origin, ...(dev ? [originUrl.origin.replace("localhost", "127.0.0.1")] : [])];

  const botToken = env.BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || "";
  const ownerTelegramId = env.OWNER_TELEGRAM_ID || env.INITIAL_OWNER_TELEGRAM_ID || "";
  const miniAppUrl = env.MINI_APP_URL || originUrl.origin;
  const nutritionAppUrl = env.NUTRITION_APP_URL || "";
  const tasksAppUrl = env.TASKS_APP_URL || "";
  if (!dev) {
    if (!botToken || !/^[1-9]\d*$/.test(ownerTelegramId)) {
      throw new Error("Telegram auth requires BOT_TOKEN and OWNER_TELEGRAM_ID");
    }
    if (new URL(miniAppUrl).protocol !== "https:") {
      throw new Error("Telegram Mini App requires HTTPS MINI_APP_URL");
    }
    if (nutritionAppUrl && new URL(nutritionAppUrl).protocol !== "https:") {
      throw new Error("Telegram Mini App requires HTTPS NUTRITION_APP_URL");
    }
    if (tasksAppUrl && new URL(tasksAppUrl).protocol !== "https:") {
      throw new Error("Telegram Mini App requires HTTPS TASKS_APP_URL");
    }
  }

  const botInDev = env.BOT_IN_DEV === "true";
  if (dev && botInDev && (!botToken || !/^[1-9]\d*$/.test(ownerTelegramId))) {
    throw new Error("BOT_IN_DEV requires BOT_TOKEN and OWNER_TELEGRAM_ID");
  }

  const webhook = readWebhookConfig(env);

  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid PORT");
  }

  return {
    env: nodeEnv,
    dev,
    host: env.HOST || (dev ? "127.0.0.1" : "0.0.0.0"),
    port,
    origin: originUrl.origin,
    allowedOrigins,
    botToken,
    // Dev login uses owner 0, unless the bot runs locally: then both must be the real owner.
    ownerTelegramId: dev && !botInDev ? 0n : BigInt(ownerTelegramId || 0),
    botInDev,
    webhook,
    miniAppUrl,
    nutritionAppUrl,
    tasksAppUrl,
    voice: readVoiceConfig(env),
    assistant: readAssistantConfig(env),
    mcp: readMcpConfig(env),
    nutrition: {
      llm: readLlmConfig(env),
      photoDir: resolve(env.PHOTO_STORAGE_DIR || DEFAULT_PHOTO_DIR),
    },
  };
}

/** The webhook needs an HTTPS URL and a secret Telegram sends back with every update. */
function readWebhookConfig(env: NodeJS.ProcessEnv): WebhookConfig | null {
  const url = env.TELEGRAM_WEBHOOK_URL || "";
  if (!url) {
    return null;
  }

  if (new URL(url).protocol !== "https:") {
    throw new Error("TELEGRAM_WEBHOOK_URL must be HTTPS");
  }

  const secret = env.TELEGRAM_WEBHOOK_SECRET || "";
  if (!WEBHOOK_SECRET.test(secret)) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET must be 32-256 characters: letters, digits, _ and -");
  }

  return { url, secret };
}

/** The MCP server is off without a secret: the secret in its URL is the only key to the data. */
function readMcpConfig(env: NodeJS.ProcessEnv): McpConfig | null {
  const secret = env.MCP_SECRET || "";
  if (!secret) {
    return null;
  }

  if (!WEBHOOK_SECRET.test(secret)) {
    throw new Error("MCP_SECRET must be 32-256 characters: letters, digits, _ and -");
  }

  return { secret };
}

/** Meal recognition is optional: without an API key the rest of the API still works. */
function readLlmConfig(env: NodeJS.ProcessEnv): LlmConfig | null {
  const provider = (env.NUTRITION_LLM_PROVIDER || "claude") as LlmProvider;
  if (!LLM_PROVIDERS.includes(provider)) {
    throw new Error(`NUTRITION_LLM_PROVIDER must be one of: ${LLM_PROVIDERS.join(", ")}`);
  }
  const apiKey = env[LLM_API_KEY_ENV[provider]] || "";
  if (!apiKey) {
    return null;
  }
  const model = env.NUTRITION_LLM_MODEL || DEFAULT_LLM_MODEL[provider];
  if (!model) {
    throw new Error(`NUTRITION_LLM_MODEL is required for the ${provider} provider`);
  }
  return { provider, model, apiKey };
}

/** Voice commands are optional: without a key the bot answers that they are not set up. */
function readVoiceConfig(env: NodeJS.ProcessEnv): VoiceConfig | null {
  const apiKey = env.OPENAI_API_KEY || "";
  if (!apiKey) {
    return null;
  }
  return {
    apiKey,
    transcriptionBaseUrl: env.WHISPER_BASE_URL || undefined,
    transcriptionModel: env.WHISPER_MODEL || "whisper-1",
  };
}

/** The assistant is optional: without a key the bot says it is not set up. */
function readAssistantConfig(env: NodeJS.ProcessEnv): AssistantConfig | null {
  const apiKey = env.OPENAI_API_KEY || "";
  if (!apiKey) {
    return null;
  }

  return { apiKey, model: env.ASSISTANT_LLM_MODEL || DEFAULT_ASSISTANT_MODEL };
}

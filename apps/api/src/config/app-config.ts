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

export interface AppConfig {
  env: string;
  dev: boolean;
  host: string;
  port: number;
  origin: string;
  allowedOrigins: string[];
  botToken: string;
  ownerTelegramId: bigint;
  miniAppUrl: string;
  /** Nutrition Mini App URL for the bot's /start buttons; empty when not deployed. */
  nutritionAppUrl: string;
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
  }

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
    ownerTelegramId: dev ? 0n : BigInt(ownerTelegramId),
    miniAppUrl,
    nutritionAppUrl,
    nutrition: {
      llm: readLlmConfig(env),
      photoDir: resolve(env.PHOTO_STORAGE_DIR || DEFAULT_PHOTO_DIR),
    },
  };
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

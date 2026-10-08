export interface AppConfig {
  env: string; dev: boolean; host: string; port: number; origin: string;
  botToken: string; ownerTelegramId: bigint; miniAppUrl: string;
}
const loopback = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const bypass = env.DEV_BYPASS_AUTH === 'true';
  const mode = env.AUTH_MODE || (bypass ? 'dev' : 'telegram');
  const nodeEnv = env.NODE_ENV || 'production';
  if (!['dev', 'telegram'].includes(mode)) throw new Error('AUTH_MODE must be dev or telegram');
  const dev = mode === 'dev' || bypass;
  const host = env.HOST || (dev && !bypass ? '127.0.0.1' : '0.0.0.0');
  const origin = env.APP_ORIGIN || (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',')[0].trim() : 'http://localhost:5173');
  const originUrl = new URL(origin);
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (dev && !bypass && (nodeEnv !== 'development' || !loopback.has(host) || !loopback.has(originUrl.hostname) || !loopback.has(new URL(env.DATABASE_URL).hostname))) {
    throw new Error('Dev auth requires NODE_ENV=development and loopback HOST, APP_ORIGIN and DATABASE_URL');
  }
  const botToken = env.BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || '';
  const ownerIdStr = env.OWNER_TELEGRAM_ID || env.INITIAL_OWNER_TELEGRAM_ID || '';
  if (!dev && (!botToken || !/^[1-9]\d*$/.test(ownerIdStr))) {
    throw new Error('Telegram auth requires BOT_TOKEN and OWNER_TELEGRAM_ID');
  }
  if (nodeEnv === 'production' && !bypass && originUrl.protocol !== 'https:') throw new Error('Production requires HTTPS APP_ORIGIN');
  const miniAppUrl = env.MINI_APP_URL || originUrl.origin;
  if (!dev && new URL(miniAppUrl).protocol !== 'https:') throw new Error('Telegram Mini App requires HTTPS MINI_APP_URL');
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return { env: nodeEnv, dev, host, port, origin: originUrl.origin, botToken, ownerTelegramId: dev ? 0n : BigInt(ownerIdStr || '0'), miniAppUrl };
}
export const CONFIG = Symbol('APP_CONFIG');

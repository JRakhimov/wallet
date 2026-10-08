export interface AppConfig {
  env: string; dev: boolean; host: string; port: number; origin: string;
  botToken: string; ownerTelegramId: bigint; miniAppUrl: string;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const mode = env.AUTH_MODE || 'telegram';
  const nodeEnv = env.NODE_ENV || 'production';
  if (!['dev', 'telegram'].includes(mode)) throw new Error('AUTH_MODE must be dev or telegram');
  const dev = mode === 'dev';
  const host = env.HOST || (dev ? '127.0.0.1' : '0.0.0.0');
  const origin = env.APP_ORIGIN || (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',')[0].trim() : 'http://localhost:5173');
  const originUrl = new URL(origin);
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (dev && nodeEnv !== 'development') throw new Error('AUTH_MODE=dev requires NODE_ENV=development');
  const botToken = env.BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || '';
  const ownerIdStr = env.OWNER_TELEGRAM_ID || env.INITIAL_OWNER_TELEGRAM_ID || '';
  if (!dev && (!botToken || !/^[1-9]\d*$/.test(ownerIdStr))) {
    throw new Error('Telegram auth requires BOT_TOKEN and OWNER_TELEGRAM_ID');
  }
  if (nodeEnv === 'production' &&originUrl.protocol !== 'https:') throw new Error('Production requires HTTPS APP_ORIGIN');
  const miniAppUrl = env.MINI_APP_URL || originUrl.origin;
  if (!dev && new URL(miniAppUrl).protocol !== 'https:') throw new Error('Telegram Mini App requires HTTPS MINI_APP_URL');
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return { env: nodeEnv, dev, host, port, origin: originUrl.origin, botToken, ownerTelegramId: dev ? 0n : BigInt(ownerIdStr || '0'), miniAppUrl };
}
export const CONFIG = Symbol('APP_CONFIG');

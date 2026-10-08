import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { readConfig } from '../src/config';
import { Database } from '../src/database';
import { TelegramBot } from '../src/telegram-bot';

const config = readConfig({ NODE_ENV: 'production', AUTH_MODE: 'telegram', APP_ORIGIN: 'https://wallet.example', DATABASE_URL: 'postgresql://localhost/wallet', BOT_TOKEN: '123:token', OWNER_TELEGRAM_ID: '123' });
const update = { update_id: 42, message: { text: '/start', from: { id: 123 }, chat: { id: 123, type: 'private' } } };
function database() {
  const ids = new Set<bigint>();
  return { ids, botUpdate: {
    async create({ data }: { data: { updateId: bigint } }) {
      if (ids.has(data.updateId)) throw new Prisma.PrismaClientKnownRequestError('Duplicate', { code: 'P2002', clientVersion: '6.19.0' });
      ids.add(data.updateId);
    },
    async delete({ where }: { where: { updateId: bigint } }) { ids.delete(where.updateId); },
  } };
}

test('polling deletes webhook, acknowledges processed updates and aborts on shutdown', async t => {
  const db = database(), calls: { method: string; body: Record<string, unknown> }[] = [];
  let waiting!: () => void;
  const blocked = new Promise<void>(resolve => { waiting = resolve; });
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    const method = url.split('/').at(-1)!;
    calls.push({ method, body: JSON.parse(String(options.body)) });
    if (method === 'getUpdates' && calls.filter(c => c.method === method).length === 2) {
      waiting();
      return new Promise<Response>((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(new Error('Stopped')), { once: true }));
    }
    return Response.json({ ok: true, result: method === 'getUpdates' ? [update] : true });
  });
  const bot = new TelegramBot(db as unknown as Database, config);
  try {
    await bot.onApplicationBootstrap();
    await blocked;
    assert.deepEqual(calls.map(c => c.method), ['deleteWebhook', 'getUpdates', 'sendMessage', 'getUpdates']);
    assert.equal(calls[0].body.drop_pending_updates, false);
    assert.equal(calls[3].body.offset, 43);
    assert.deepEqual(calls[1].body.allowed_updates, ['message']);
  } finally { await bot.onModuleDestroy(); }
});

test('only owner /start is answered; duplicates are ignored and failed sends can be retried', async t => {
  const db = database();
  let sends = 0, fail = true;
  t.mock.method(globalThis, 'fetch', async () => { sends++; return Response.json({ ok: !fail, result: true }); });
  const bot = new TelegramBot(db as unknown as Database, config);
  await bot.handleUpdate({ ...update, message: { ...update.message, from: { id: 999 } } });
  await bot.handleUpdate({ ...update, message: { ...update.message, chat: { id: 123, type: 'group' } } });
  assert.equal(sends, 0);
  await assert.rejects(bot.handleUpdate(update));
  assert.equal(db.ids.size, 0);
  fail = false;
  await bot.handleUpdate(update);
  await bot.handleUpdate(update);
  assert.equal(sends, 2);
  assert.equal(db.ids.size, 1);
});

test('local development does not start the Telegram bot', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected call'); });
  const bot = new TelegramBot(database() as unknown as Database, { ...config, dev: true });
  await bot.onApplicationBootstrap();
  await bot.onModuleDestroy();
  assert.equal(fetch.mock.callCount(), 0);
});

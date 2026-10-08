import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { setTimeout as delay } from 'node:timers/promises';
import { AppConfig, CONFIG } from './config';
import { Database } from './database';

type Update = {
  update_id: number;
  message?: { text?: string; from?: { id: number }; chat: { id: number; type: string } };
};

@Injectable()
export class TelegramBot implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly stop = new AbortController();
  private task?: Promise<void>;
  constructor(private readonly db: Database, @Inject(CONFIG) private readonly config: AppConfig) {}

  async onApplicationBootstrap() {
    if (this.config.dev) return;
    await this.call('deleteWebhook', { drop_pending_updates: false });
    this.task = this.poll();
    Logger.log('Telegram bot started in polling mode', 'TelegramBot');
  }

  async onModuleDestroy() {
    this.stop.abort();
    await this.task;
  }

  private async call<T>(method: string, body: object): Promise<T> {
    const response = await fetch('https://api.telegram.org/bot' + this.config.botToken + '/' + method, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.any([this.stop.signal, AbortSignal.timeout(method === 'getUpdates' ? 40_000 : 10_000)]),
    });
    const result = await response.json() as { ok: boolean; result: T };
    // Do not log fetch errors or URLs: they can contain the bot token.
    if (!response.ok || !result.ok) throw new Error('Telegram request failed');
    return result.result;
  }

  private async poll() {
    let offset = 0;
    while (!this.stop.signal.aborted) {
      try {
        const updates = await this.call<Update[]>('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
        for (const update of updates) {
          if (this.stop.signal.aborted) return;
          await this.handleUpdate(update);
          offset = update.update_id + 1;
        }
      } catch {
        if (this.stop.signal.aborted) return;
        Logger.warn('Telegram polling failed; retrying in 5 seconds', 'TelegramBot');
        await delay(5000, undefined, { signal: this.stop.signal }).catch(() => {});
      }
    }
  }

  async handleUpdate(update: Update) {
    const message = update.message;
    if (!message?.from || BigInt(message.from.id) !== this.config.ownerTelegramId ||
        message.chat.type !== 'private' || message.chat.id !== message.from.id ||
        !/^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(message.text || '')) return;
    const updateId = BigInt(update.update_id);
    try { await this.db.botUpdate.create({ data: { updateId } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
    try {
      await this.call('sendMessage', {
        chat_id: message.chat.id,
        text: 'Ваш личный кошелёк. Записывайте расходы и следите за бюджетом.',
        reply_markup: { inline_keyboard: [[{ text: 'Открыть кошелёк', web_app: { url: this.config.miniAppUrl } }]] },
      });
    } catch (error) {
      await this.db.botUpdate.delete({ where: { updateId } });
      throw error;
    }
  }
}

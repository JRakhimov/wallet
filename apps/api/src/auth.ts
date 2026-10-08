import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Inject, Injectable, Post, Req, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { z } from 'zod';
import { Database } from './database';
import { AppConfig, CONFIG } from './config';
import { parse } from './validation';

export const Public = () => SetMetadata('public', true);
export type OwnerRequest = Request & { ownerId: string; sessionHash: string };
export function verifyTelegram(initData: string, botToken: string, ownerId: bigint, now = Date.now()) {
  const params = new URLSearchParams(initData);
  if (new Set(params.keys()).size !== [...params.keys()].length) throw new UnauthorizedException('Повторяющиеся поля авторизации');
  const hash = params.get('hash') || '';
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new UnauthorizedException('Неверная подпись Telegram');
  params.delete('hash');
  const data = [...params.entries()].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => k + '=' + v).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(data).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw new UnauthorizedException('Неверная подпись Telegram');
  const timestamp = Number(params.get('auth_date'));
  if (!Number.isInteger(timestamp) || now / 1000 - timestamp > 300 || timestamp > now / 1000 + 30) throw new UnauthorizedException('Переоткройте приложение в Telegram');
  let raw: unknown;
  try { raw = JSON.parse(params.get('user') || 'null'); } catch { throw new UnauthorizedException('Нет пользователя Telegram'); }
  const user = z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), first_name: z.string().optional() }).safeParse(raw);
  if (!user.success) throw new UnauthorizedException('Нет пользователя Telegram');
  if (BigInt(user.data.id) !== ownerId) throw new ForbiddenException('Этот кошелёк доступен только владельцу');
  return user.data;
}
const categories = [
  ['Продукты','shopping-basket'], ['Кафе','coffee'], ['Транспорт','car'], ['Дом','house'],
  ['Покупки','shopping-bag'], ['Здоровье','heart-pulse'], ['Развлечения','popcorn'],
  ['Подписки','repeat'], ['Образование','graduation-cap'], ['Другое','shapes'],
];
@Injectable()
export class AuthService {
  constructor(private readonly db: Database, @Inject(CONFIG) readonly config: AppConfig) {}
  async login() {
    const owner = await this.db.owner.upsert({
      where: { telegramId: this.config.ownerTelegramId },
      update: {},
      create: {
        telegramId: this.config.ownerTelegramId,
        accounts: { create: { name: 'Основная карта', kind: 'card' } },
        categories: { create: [
          ...categories.map(([name, icon], position) => ({ name, icon, position, kind: 'expense' })),
          { name: 'Зарплата', icon: 'briefcase-business', position: 0, kind: 'income' },
          { name: 'Другой доход', icon: 'circle-plus', position: 1, kind: 'income' },
        ] },
      },
    });
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 12 * 3600_000);
    await this.db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.db.session.create({ data: { tokenHash: createHash('sha256').update(token).digest('hex'), ownerId: owner.id, expiresAt } });
    return { token, expiresAt: expiresAt.toISOString(), mode: this.config.dev ? 'dev' : 'telegram' };
  }
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly db: Database, @Inject(CONFIG) private readonly config: AppConfig) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest<OwnerRequest>();
    const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '');
    if (!bearer) throw new UnauthorizedException('Требуется вход');
    const hash = createHash('sha256').update(bearer[1]).digest('hex');
    const session = await this.db.session.findUnique({ where: { tokenHash: hash }, include: { owner: true } });
    if (!session || session.expiresAt.getTime() <= Date.now() || session.owner.telegramId !== this.config.ownerTelegramId) throw new UnauthorizedException('Сессия истекла. Выполните вход снова');
    req.ownerId = session.ownerId; req.sessionHash = hash;
    return true;
  }
}
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly db: Database) {}
  @Public() @Get('config')
  config() { return { dev: this.auth.config.dev }; }
  @Public() @Post('dev')
  dev() {
    if (!this.auth.config.dev) throw new ForbiddenException('Локальный вход отключён');
    return this.auth.login();
  }
  @Public() @Post('telegram')
  telegram(@Body() body: unknown) {
    if (this.auth.config.dev) throw new ForbiddenException('Используйте локальный вход');
    const { initData } = parse(z.object({ initData: z.string().min(1).max(8192) }).strict(), body);
    verifyTelegram(initData, this.auth.config.botToken, this.auth.config.ownerTelegramId);
    return this.auth.login();
  }
  @Post('logout')
  async logout(@Req() req: OwnerRequest) { await this.db.session.deleteMany({ where: { tokenHash: req.sessionHash } }); return { ok: true }; }
}

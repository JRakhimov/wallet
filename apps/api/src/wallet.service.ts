import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { Database } from './database';
import { currentMonth, monthRange, OperationInput } from './validation';

const include = { category: true, entries: { include: { account: true } }, refunds: { where: { deletedAt: null }, select: { amount: true } } } satisfies Prisma.OperationInclude;
type Detailed = Prisma.OperationGetPayload<{ include: typeof include }>;
type Tx = Prisma.TransactionClient;
const decimal = (n: string | number) => new Prisma.Decimal(n);
const sum = (values: Prisma.Decimal[]) => values.reduce((a,b) => a.plus(b), decimal(0));
function view(op: Detailed, timezone: string) {
  return {
    id: op.id, kind: op.kind, amount: op.amount.toFixed(2), currency: op.currency,
    category: op.category, note: op.note, occurredAt: op.occurredAt.toISOString(),
    localDate: DateTime.fromJSDate(op.occurredAt).setZone(timezone).toISODate(),
    version: op.version, deleted: Boolean(op.deletedAt), parentId: op.parentId,
    refunded: sum(op.refunds.map(r => r.amount)).toFixed(2),
    entries: op.entries.map(e => ({ accountId: e.accountId, accountName: e.account.name, amount: e.amount.toFixed(2) })),
  };
}
@Injectable()
export class WalletService {
  constructor(private readonly db: Database) {}
  // One owner, one short write lock: serializes refunds, balances and retries.
  private write<T>(ownerId: string, work: (tx: Tx) => Promise<T>) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Owner" WHERE id = ${ownerId}::uuid FOR UPDATE`;
      return work(tx);
    }, { maxWait: 5000, timeout: 10000 });
  }
  async owner(id: string) {
    const row = await this.db.owner.findUniqueOrThrow({ where: { id } });
    return { id: row.id, name: row.name, timezone: row.timezone, theme: row.theme, currency: 'UZS' };
  }
  async accounts(ownerId: string) {
    const [accounts, balances] = await Promise.all([
      this.db.account.findMany({ where: { ownerId }, orderBy: { createdAt: 'asc' } }),
      this.db.entry.groupBy({ by: ['accountId'], where: { account: { ownerId }, operation: { ownerId, deletedAt: null } }, _sum: { amount: true } }),
    ]);
    return accounts.map(a => ({ ...a, balance: (balances.find(b => b.accountId === a.id)?._sum.amount || decimal(0)).toFixed(2) }));
  }
  async createAccount(ownerId: string, input: { name: string; kind: string; openingBalance: string }) {
    return this.write(ownerId, async tx => {
      const account = await tx.account.create({ data: { ownerId, name: input.name, kind: input.kind } });
      const amount = decimal(input.openingBalance);
      if (!amount.isZero()) await tx.operation.create({ data: {
        ownerId, kind: 'opening', amount: amount.abs(), occurredAt: new Date(), note: 'Начальный остаток',
        idempotencyKey: 'opening-' + account.id, requestHash: '', entries: { create: { accountId: account.id, amount } },
      } });
      return account;
    });
  }
  async updateAccount(ownerId: string, id: string, input: { name?: string; archived?: boolean }) {
    return this.write(ownerId, async tx => {
      const account = await tx.account.findFirst({ where: { id, ownerId } });
      if (!account) throw new NotFoundException('Счёт не найден');
      if (input.archived && !account.archived && await tx.account.count({ where: { ownerId, archived: false } }) <= 1) throw new BadRequestException('Оставьте хотя бы один активный счёт');
      return tx.account.update({ where: { id }, data: input });
    });
  }
  categories(ownerId: string) { return this.db.category.findMany({ where: { ownerId }, orderBy: [{ kind: 'asc' }, { position: 'asc' }, { name: 'asc' }] }); }
  async createCategory(ownerId: string, input: { name: string; icon: string; kind: string }) {
    return this.write(ownerId, async tx => tx.category.create({ data: { ownerId, ...input, position: await tx.category.count({ where: { ownerId, kind: input.kind } }) } }));
  }
  async updateCategory(ownerId: string, id: string, input: { name?: string; icon?: string; archived?: boolean; favorite?: boolean }) {
    return this.write(ownerId, async tx => {
      if (!await tx.category.findFirst({ where: { id, ownerId } })) throw new NotFoundException('Категория не найдена');
      return tx.category.update({ where: { id }, data: input });
    });
  }
  private async prepare(tx: Tx, ownerId: string, input: OperationInput, excludeId?: string) {
    const account = await tx.account.findFirst({ where: { id: input.accountId, ownerId, archived: false } });
    if (!account) throw new BadRequestException('Выберите активный счёт');
    const amount = decimal(input.amount);
    let categoryId: string | null = input.categoryId || null;
    let parentId: string | null = null;
    let entries: { accountId: string; amount: Prisma.Decimal }[];
    if (input.kind === 'transfer') {
      if (!input.targetAccountId || input.targetAccountId === input.accountId) throw new BadRequestException('Выберите другой счёт получателя');
      const target = await tx.account.findFirst({ where: { id: input.targetAccountId, ownerId, archived: false, currency: account.currency } });
      if (!target) throw new BadRequestException('Счёт получателя недоступен');
      categoryId = null;
      entries = [{ accountId: account.id, amount: amount.negated() }, { accountId: target.id, amount }];
    } else if (input.kind === 'adjustment') {
      if (!input.direction) throw new BadRequestException('Укажите направление корректировки');
      categoryId = null;
      entries = [{ accountId: account.id, amount: input.direction === 'out' ? amount.negated() : amount }];
    } else if (input.kind === 'refund') {
      const parent = input.parentId && await tx.operation.findFirst({ where: { id: input.parentId, ownerId, kind: 'expense', deletedAt: null } });
      if (!parent) throw new BadRequestException('Исходная покупка не найдена');
      const returned = await tx.operation.findMany({ where: { parentId: parent.id, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) } });
      if (sum(returned.map(r => r.amount)).plus(amount).gt(parent.amount)) throw new BadRequestException('Возврат превышает невозвращённую сумму покупки');
      if (new Date(input.occurredAt) < parent.occurredAt) throw new BadRequestException('Возврат не может быть раньше покупки');
      categoryId = parent.categoryId; parentId = parent.id;
      entries = [{ accountId: account.id, amount }];
    } else {
      const category = categoryId && await tx.category.findFirst({ where: { id: categoryId, ownerId, kind: input.kind, archived: false } });
      if (!category) throw new BadRequestException('Выберите категорию операции');
      entries = [{ accountId: account.id, amount: input.kind === 'expense' ? amount.negated() : amount }];
    }
    return { amount, categoryId, parentId, entries, currency: account.currency };
  }
  async createOperation(ownerId: string, input: OperationInput, key: string) {
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.write(ownerId, async tx => {
      const timezone = (await tx.owner.findUniqueOrThrow({ where: { id: ownerId } })).timezone;
      const existing = await tx.operation.findUnique({ where: { ownerId_idempotencyKey: { ownerId, idempotencyKey: key } }, include });
      if (existing) {
        if (existing.requestHash !== hash) throw new ConflictException('Этот ключ уже использован для другой операции');
        return view(existing, timezone);
      }
      const data = await this.prepare(tx, ownerId, input);
      const op = await tx.operation.create({ data: {
        ownerId, kind: input.kind, amount: data.amount, currency: data.currency,
        categoryId: data.categoryId, parentId: data.parentId, note: input.note, occurredAt: input.occurredAt,
        idempotencyKey: key, requestHash: hash, entries: { create: data.entries },
      }, include });
      return view(op, timezone);
    });
  }
  async updateOperation(ownerId: string, id: string, input: OperationInput, version: number) {
    return this.write(ownerId, async tx => {
      const op = await tx.operation.findFirst({ where: { id, ownerId, deletedAt: null }, include });
      if (!op) throw new NotFoundException('Операция не найдена');
      if (op.version !== version) throw new ConflictException('Операция уже изменена. Обновите историю');
      if (op.kind === 'opening') throw new BadRequestException('Для изменения начального остатка используйте корректировку');
      if (input.kind !== op.kind) throw new BadRequestException('Тип существующей операции менять нельзя');
      if (op.refunds.length) throw new BadRequestException('Сначала удалите связанные возвраты');
      const data = await this.prepare(tx, ownerId, input, id);
      await tx.entry.deleteMany({ where: { operationId: id } });
      const updated = await tx.operation.update({ where: { id }, data: {
        amount: data.amount, categoryId: data.categoryId, parentId: data.parentId,
        note: input.note, occurredAt: input.occurredAt, version: { increment: 1 },
        entries: { create: data.entries },
      }, include });
      return view(updated, (await tx.owner.findUniqueOrThrow({ where: { id: ownerId } })).timezone);
    });
  }
  async removeOperation(ownerId: string, id: string, version: number, restore = false) {
    return this.write(ownerId, async tx => {
      const op = await tx.operation.findFirst({ where: { id, ownerId }, include });
      if (!op) throw new NotFoundException('Операция не найдена');
      if (op.version !== version) throw new ConflictException('Операция уже изменена. Обновите историю');
      if (restore && !op.deletedAt) throw new BadRequestException('Операция уже активна');
      if (!restore && op.deletedAt) throw new BadRequestException('Операция уже удалена');
      if (!restore && op.refunds.length) throw new BadRequestException('Сначала удалите связанные возвраты');
      if (restore && op.deletedAt) {
        if (op.entries.some(e => e.account.archived)) throw new BadRequestException('Сначала восстановите счёт из архива');
        if (op.kind === 'refund') await this.prepare(tx, ownerId, { kind: 'refund', amount: op.amount.toFixed(2), accountId: op.entries[0].accountId, parentId: op.parentId!, note: op.note, occurredAt: op.occurredAt.toISOString() }, id);
      }
      const updated = await tx.operation.update({ where: { id }, data: { deletedAt: restore ? null : new Date(), version: { increment: 1 } }, include });
      return view(updated, (await tx.owner.findUniqueOrThrow({ where: { id: ownerId } })).timezone);
    });
  }
  private async filter(ownerId: string, query: { month?: string; kind?: string; categoryId?: string; accountId?: string; q?: string; deleted?: string }) {
    const owner = await this.owner(ownerId);
    const month = query.month || currentMonth(owner.timezone);
    const where: Prisma.OperationWhereInput = {
      ownerId, deletedAt: query.deleted === 'true' ? { not: null } : null, occurredAt: monthRange(month, owner.timezone),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.accountId ? { entries: { some: { accountId: query.accountId } } } : {}),
      ...(query.q ? { OR: [{ note: { contains: query.q, mode: 'insensitive' } }, { category: { name: { contains: query.q, mode: 'insensitive' } } }] } : {}),
    };
    return { where, owner, month };
  }
  async operations(ownerId: string, query: { month?: string; kind?: string; categoryId?: string; accountId?: string; q?: string; cursor?: string; deleted?: string }, limit = 40) {
    const { where, owner } = await this.filter(ownerId, query);
    if (query.cursor && !await this.db.operation.findFirst({ where: { AND: [where, { id: query.cursor }] } })) throw new BadRequestException('Обновите список операций');
    const [rows, count] = await this.db.$transaction([
      this.db.operation.findMany({ where, include, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) }),
      this.db.operation.count({ where }),
    ]);
    return { items: rows.slice(0,limit).map(o => view(o, owner.timezone)), count, nextCursor: rows.length > limit ? rows[limit - 1].id : null };
  }
  async summary(ownerId: string, requestedMonth?: string) {
    const { where, owner, month } = await this.filter(ownerId, { month: requestedMonth });
    const [operations, budget] = await this.db.$transaction([
      this.db.operation.findMany({ where, include: { category: true } }),
      this.db.budget.findUnique({ where: { ownerId_month: { ownerId, month } } }),
    ]);
    let expenses = decimal(0), income = decimal(0), refunds = decimal(0);
    const categories = new Map<string, { id: string; name: string; icon: string; value: Prisma.Decimal }>();
    const days = new Map<string, Prisma.Decimal>();
    for (const op of operations) {
      if (op.kind === 'income') income = income.plus(op.amount);
      if (!['expense','refund'].includes(op.kind)) continue;
      if (op.kind === 'expense') expenses = expenses.plus(op.amount); else refunds = refunds.plus(op.amount);
      const amount = op.kind === 'refund' ? op.amount.negated() : op.amount;
      const cat = op.category!;
      const aggregate = categories.get(cat.id) || { id: cat.id, name: cat.name, icon: cat.icon, value: decimal(0) };
      aggregate.value = aggregate.value.plus(amount); categories.set(cat.id, aggregate);
      const day = DateTime.fromJSDate(op.occurredAt).setZone(owner.timezone).toISODate()!;
      days.set(day, (days.get(day) || decimal(0)).plus(amount));
    }
    const net = expenses.minus(refunds);
    return {
      month, expense: expenses.toFixed(2), refunds: refunds.toFixed(2), netExpense: net.toFixed(2), income: income.toFixed(2),
      budget: budget?.amount.toFixed(2) || null, remaining: budget ? budget.amount.minus(net).toFixed(2) : null,
      categories: [...categories.values()].sort((a,b) => b.value.comparedTo(a.value)).map(c => ({ ...c, value: c.value.toFixed(2) })),
      days: [...days.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([date,value]) => ({ date, value: value.toFixed(2) })),
    };
  }
  budget(ownerId: string, month: string, amount: string) {
    return this.db.budget.upsert({ where: { ownerId_month: { ownerId, month } }, create: { ownerId, month, amount }, update: { amount } }).then(b => ({ month, amount: b.amount.toFixed(2) }));
  }
  async settings(ownerId: string, data: { timezone?: string; theme?: string; name?: string }) {
    await this.db.owner.update({ where: { id: ownerId }, data }); return this.owner(ownerId);
  }
  async export(ownerId: string, month?: string) {
    const { where, owner } = await this.filter(ownerId, { month });
    const operations = await this.db.operation.findMany({ where, include, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] });
    // Prefix spreadsheet formulas before CSV quoting.
    const cell = (v: string) => '"' + (/^[\s]*[=+\-@]/.test(v) ? "'" + v : v).replace(/"/g, '""') + '"';
    const rows = [['ID','Дата','Тип','Сумма','Валюта','Категория','Со счёта','На счёт','Заметка']];
    for (const op of operations) rows.push([
      op.id, DateTime.fromJSDate(op.occurredAt).setZone(owner.timezone).toISO()!, op.kind, op.amount.toFixed(2),
      'UZS', op.category?.name || '', op.entries.filter(e => e.amount.isNegative()).map(e => e.account.name).join(', '),
      op.entries.filter(e => !e.amount.isNegative()).map(e => e.account.name).join(', '), op.note,
    ]);
    return '\uFEFF' + rows.map(r => r.map(cell).join(';')).join('\r\n');
  }
}

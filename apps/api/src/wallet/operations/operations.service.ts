import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Account, Prisma } from "@prisma/client";
import { sha256 } from "../../common/utils/hash";
import { currentMonth, monthRange } from "../../common/utils/month";
import { OwnerService } from "../../owner/owner.service";
import { PrismaService } from "../../prisma/prisma.service";
import { convertAtRate } from "../currency";
import { OperationDto, OperationFilterDto, OperationQueryDto } from "./dto/operation.dto";
import { decimal, DetailedOperation, operationInclude, operationView, sum } from "./operation.view";

type Tx = Prisma.TransactionClient;

type LedgerEntry = { accountId: string; amount: Prisma.Decimal };

/** Validated operation ready to be written: amounts, links and balanced ledger entries. */
type PreparedOperation = {
  amount: Prisma.Decimal;
  currency: string;
  /** Exchange rate of a transfer between currencies; null for everything else. */
  rate: Prisma.Decimal | null;
  categoryId: string | null;
  parentId: string | null;
  entries: LedgerEntry[];
};

const PAGE_SIZE = 40;

@Injectable()
export class OperationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly owners: OwnerService,
  ) {}

  async list(ownerId: string, query: OperationQueryDto, limit = PAGE_SIZE) {
    const { where, timezone } = await this.buildFilter(ownerId, query);

    if (query.cursor) {
      const cursorInFilter = await this.db.operation.findFirst({
        where: { AND: [where, { id: query.cursor }] },
      });
      if (!cursorInFilter) {
        throw new BadRequestException("Обновите список операций");
      }
    }

    const [rows, count] = await this.db.$transaction([
      this.db.operation.findMany({
        where,
        include: operationInclude,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.db.operation.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    return {
      items: rows.slice(0, limit).map((operation) => operationView(operation, timezone)),
      count,
      nextCursor: hasMore ? rows[limit - 1].id : null,
    };
  }

  /**
   * Creates an operation idempotently: repeating a request with the same key
   * returns the original operation instead of creating a duplicate.
   */
  create(ownerId: string, input: OperationDto, idempotencyKey: string) {
    const requestHash = sha256(JSON.stringify(input));

    return this.db.ownerTransaction(ownerId, async (tx) => {
      const timezone = await this.timezone(tx, ownerId);
      const existing = await tx.operation.findUnique({
        where: { ownerId_idempotencyKey: { ownerId, idempotencyKey } },
        include: operationInclude,
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException("Этот ключ уже использован для другой операции");
        }
        return operationView(existing, timezone);
      }

      const prepared = await this.prepare(tx, ownerId, input);
      const operation = await tx.operation.create({
        data: {
          ownerId,
          kind: input.kind,
          amount: prepared.amount,
          currency: prepared.currency,
          rate: prepared.rate,
          categoryId: prepared.categoryId,
          parentId: prepared.parentId,
          note: input.note,
          occurredAt: input.occurredAt,
          idempotencyKey,
          requestHash,
          entries: { create: prepared.entries },
        },
        include: operationInclude,
      });
      return operationView(operation, timezone);
    });
  }

  update(ownerId: string, id: string, input: OperationDto, version: number) {
    return this.db.ownerTransaction(ownerId, async (tx) => {
      const operation = await this.findForChange(tx, ownerId, id, version, { deletedAt: null });
      if (operation.kind === "opening") {
        throw new BadRequestException("Для изменения начального остатка используйте корректировку");
      }
      if (input.kind !== operation.kind) {
        throw new BadRequestException("Тип существующей операции менять нельзя");
      }
      if (operation.refunds.length) {
        throw new BadRequestException("Сначала удалите связанные возвраты");
      }

      const prepared = await this.prepare(tx, ownerId, input, id);
      await tx.entry.deleteMany({ where: { operationId: id } });
      const updated = await tx.operation.update({
        where: { id },
        data: {
          amount: prepared.amount,
          currency: prepared.currency,
          rate: prepared.rate,
          categoryId: prepared.categoryId,
          parentId: prepared.parentId,
          note: input.note,
          occurredAt: input.occurredAt,
          version: { increment: 1 },
          entries: { create: prepared.entries },
        },
        include: operationInclude,
      });
      return operationView(updated, await this.timezone(tx, ownerId));
    });
  }

  /** Soft-deletes an operation. */
  remove(ownerId: string, id: string, version: number) {
    return this.db.ownerTransaction(ownerId, async (tx) => {
      const operation = await this.findForChange(tx, ownerId, id, version);
      if (operation.deletedAt) {
        throw new BadRequestException("Операция уже удалена");
      }
      if (operation.refunds.length) {
        throw new BadRequestException("Сначала удалите связанные возвраты");
      }
      return this.setDeleted(tx, ownerId, id, new Date());
    });
  }

  /** Restores a soft-deleted operation after re-checking that it is still valid. */
  restore(ownerId: string, id: string, version: number) {
    return this.db.ownerTransaction(ownerId, async (tx) => {
      const operation = await this.findForChange(tx, ownerId, id, version);
      if (!operation.deletedAt) {
        throw new BadRequestException("Операция уже активна");
      }
      if (operation.entries.some((entry) => entry.account.archived)) {
        throw new BadRequestException("Сначала восстановите счёт из архива");
      }
      if (operation.kind === "refund") {
        await this.prepare(tx, ownerId, refundInput(operation), id);
      }
      return this.setDeleted(tx, ownerId, id, null);
    });
  }

  /** Prisma filter for a month of operations, shared with reports and exports. */
  async buildFilter(ownerId: string, query: OperationFilterDto) {
    const timezone = await this.owners.getTimezone(ownerId);
    const month = query.month || currentMonth(timezone);

    const where: Prisma.OperationWhereInput = {
      ownerId,
      deletedAt: query.deleted === "true" ? { not: null } : null,
      occurredAt: monthRange(month, timezone),
    };
    if (query.kind) {
      where.kind = query.kind;
    }
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.accountId) {
      where.entries = { some: { accountId: query.accountId } };
    }
    if (query.q) {
      where.OR = [
        { note: { contains: query.q, mode: "insensitive" } },
        { category: { name: { contains: query.q, mode: "insensitive" } } },
      ];
    }
    return { where, timezone, month };
  }

  private async timezone(tx: Tx, ownerId: string) {
    const owner = await tx.owner.findUniqueOrThrow({ where: { id: ownerId } });
    return owner.timezone;
  }

  /** Loads an operation for modification and checks optimistic locking. */
  private async findForChange(
    tx: Tx,
    ownerId: string,
    id: string,
    version: number,
    where: Prisma.OperationWhereInput = {},
  ) {
    const operation = await tx.operation.findFirst({
      where: { id, ownerId, ...where },
      include: operationInclude,
    });
    if (!operation) {
      throw new NotFoundException("Операция не найдена");
    }
    if (operation.version !== version) {
      throw new ConflictException("Операция уже изменена. Обновите историю");
    }
    return operation;
  }

  private async setDeleted(tx: Tx, ownerId: string, id: string, deletedAt: Date | null) {
    const updated = await tx.operation.update({
      where: { id },
      data: { deletedAt, version: { increment: 1 } },
      include: operationInclude,
    });
    return operationView(updated, await this.timezone(tx, ownerId));
  }

  /** Validates references and builds ledger entries for the operation kind. */
  private async prepare(
    tx: Tx,
    ownerId: string,
    input: OperationDto,
    excludeId?: string,
  ): Promise<PreparedOperation> {
    const account = await tx.account.findFirst({
      where: { id: input.accountId, ownerId, archived: false },
    });
    if (!account) {
      throw new BadRequestException("Выберите активный счёт");
    }

    switch (input.kind) {
      case "transfer":
        return this.prepareTransfer(tx, ownerId, input, account);
      case "adjustment":
        return prepareAdjustment(input, account);
      case "refund":
        return this.prepareRefund(tx, ownerId, input, account, excludeId);
      default:
        return this.prepareCategorized(tx, ownerId, input, account);
    }
  }

  private async prepareTransfer(
    tx: Tx,
    ownerId: string,
    input: OperationDto,
    account: Account,
  ): Promise<PreparedOperation> {
    if (!input.targetAccountId || input.targetAccountId === input.accountId) {
      throw new BadRequestException("Выберите другой счёт получателя");
    }
    const target = await tx.account.findFirst({
      where: { id: input.targetAccountId, ownerId, archived: false },
    });
    if (!target) {
      throw new BadRequestException("Счёт получателя недоступен");
    }

    const amount = decimal(input.amount);
    const sameCurrency = target.currency === account.currency;
    if (sameCurrency && input.rate) {
      throw new BadRequestException("Курс нужен только при переводе между разными валютами");
    }
    if (!sameCurrency && !input.rate) {
      throw new BadRequestException("Укажите курс обмена");
    }

    const rate = input.rate ? decimal(input.rate) : null;
    // The target account is credited in its own currency.
    const credited = rate ? convertAtRate(amount, account.currency, rate) : amount;
    if (credited.isZero()) {
      throw new BadRequestException("Сумма слишком мала для этого курса");
    }

    return {
      amount,
      currency: account.currency,
      rate,
      categoryId: null,
      parentId: null,
      entries: [
        { accountId: account.id, amount: amount.negated() },
        { accountId: target.id, amount: credited },
      ],
    };
  }

  /** A refund returns money for an expense and cannot exceed what is left to refund. */
  private async prepareRefund(
    tx: Tx,
    ownerId: string,
    input: OperationDto,
    account: Account,
    excludeId?: string,
  ): Promise<PreparedOperation> {
    const parent = input.parentId
      ? await tx.operation.findFirst({
          where: { id: input.parentId, ownerId, kind: "expense", deletedAt: null },
        })
      : null;
    if (!parent) {
      throw new BadRequestException("Исходная покупка не найдена");
    }

    if (parent.currency !== account.currency) {
      throw new BadRequestException("Возврат нужно зачислить на счёт в валюте покупки");
    }

    const otherRefunds = await tx.operation.findMany({
      where: {
        parentId: parent.id,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    const amount = decimal(input.amount);
    const refundedTotal = sum(otherRefunds.map((refund) => refund.amount)).plus(amount);
    if (refundedTotal.gt(parent.amount)) {
      throw new BadRequestException("Возврат превышает невозвращённую сумму покупки");
    }
    if (new Date(input.occurredAt) < parent.occurredAt) {
      throw new BadRequestException("Возврат не может быть раньше покупки");
    }

    return {
      amount,
      currency: account.currency,
      rate: null,
      categoryId: parent.categoryId,
      parentId: parent.id,
      entries: [{ accountId: account.id, amount }],
    };
  }

  /** Expense or income: requires an active category of the same kind. */
  private async prepareCategorized(
    tx: Tx,
    ownerId: string,
    input: OperationDto,
    account: Account,
  ): Promise<PreparedOperation> {
    const category = input.categoryId
      ? await tx.category.findFirst({
          where: { id: input.categoryId, ownerId, kind: input.kind, archived: false },
        })
      : null;
    if (!category) {
      throw new BadRequestException("Выберите категорию операции");
    }

    const amount = decimal(input.amount);
    return {
      amount,
      currency: account.currency,
      rate: null,
      categoryId: category.id,
      parentId: null,
      entries: [
        { accountId: account.id, amount: input.kind === "expense" ? amount.negated() : amount },
      ],
    };
  }
}

function prepareAdjustment(input: OperationDto, account: Account): PreparedOperation {
  if (!input.direction) {
    throw new BadRequestException("Укажите направление корректировки");
  }
  const amount = decimal(input.amount);
  return {
    amount,
    currency: account.currency,
    rate: null,
    categoryId: null,
    parentId: null,
    entries: [
      { accountId: account.id, amount: input.direction === "out" ? amount.negated() : amount },
    ],
  };
}

/** Rebuilds the input of a stored refund so it can be validated again. */
function refundInput(operation: DetailedOperation): OperationDto {
  return {
    kind: "refund",
    amount: operation.amount.toFixed(2),
    accountId: operation.entries[0].accountId,
    parentId: operation.parentId ?? undefined,
    note: operation.note,
    occurredAt: operation.occurredAt.toISOString(),
  };
}

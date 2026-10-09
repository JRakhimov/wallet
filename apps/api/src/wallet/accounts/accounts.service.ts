import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateAccountDto, UpdateAccountDto } from "./dto/account.dto";

@Injectable()
export class AccountsService {
  constructor(private readonly db: PrismaService) {}

  /** Accounts with balances computed from non-deleted ledger entries. */
  async list(ownerId: string) {
    const [accounts, totals] = await Promise.all([
      this.db.account.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
      this.db.entry.groupBy({
        by: ["accountId"],
        where: { account: { ownerId }, operation: { ownerId, deletedAt: null } },
        _sum: { amount: true },
      }),
    ]);
    const balances = new Map(totals.map((total) => [total.accountId, total._sum.amount]));

    return accounts.map((account) => ({
      ...account,
      balance: (balances.get(account.id) ?? new Prisma.Decimal(0)).toFixed(2),
    }));
  }

  create(ownerId: string, input: CreateAccountDto) {
    return this.db.ownerTransaction(ownerId, async (tx) => {
      const account = await tx.account.create({
        data: { ownerId, name: input.name, kind: input.kind },
      });

      const openingBalance = new Prisma.Decimal(input.openingBalance);
      if (!openingBalance.isZero()) {
        await tx.operation.create({
          data: {
            ownerId,
            kind: "opening",
            amount: openingBalance.abs(),
            occurredAt: new Date(),
            note: "Начальный остаток",
            idempotencyKey: `opening-${account.id}`,
            requestHash: "",
            entries: { create: { accountId: account.id, amount: openingBalance } },
          },
        });
      }
      return account;
    });
  }

  update(ownerId: string, id: string, input: UpdateAccountDto) {
    return this.db.ownerTransaction(ownerId, async (tx) => {
      const account = await tx.account.findFirst({ where: { id, ownerId } });
      if (!account) {
        throw new NotFoundException("Счёт не найден");
      }

      if (input.archived && !account.archived) {
        const activeCount = await tx.account.count({ where: { ownerId, archived: false } });
        if (activeCount <= 1) {
          throw new BadRequestException("Оставьте хотя бы один активный счёт");
        }
      }
      return tx.account.update({ where: { id }, data: input });
    });
  }
}

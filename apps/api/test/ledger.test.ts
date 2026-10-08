import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { AccountsService } from "../src/accounts/accounts.service";
import { OperationsService } from "../src/operations/operations.service";
import { OwnerService } from "../src/owner/owner.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { ReportsService } from "../src/reports/reports.service";

test(
  "a real PostgreSQL ledger keeps transfers, refunds and retries consistent",
  { skip: process.env.RUN_DB_TESTS !== "1" },
  async () => {
    const db = new PrismaService();
    await db.$connect();
    const owner = await db.owner.create({ data: { telegramId: BigInt(Date.now()) } });
    const operations = new OperationsService(db, new OwnerService(db));
    const reports = new ReportsService(db, operations);
    const accountsService = new AccountsService(db);
    try {
      const cash = await db.account.create({ data: { ownerId: owner.id, name: "Cash" } });
      const card = await db.account.create({ data: { ownerId: owner.id, name: "Card" } });
      const category = await db.category.create({
        data: { ownerId: owner.id, name: "Food", kind: "expense" },
      });
      const when = new Date().toISOString();
      const expense = {
        kind: "expense" as const,
        amount: "50.00",
        accountId: card.id,
        categoryId: category.id,
        note: "Lunch",
        occurredAt: when,
      };
      const key = randomUUID();
      const first = await operations.create(owner.id, expense, key);
      assert.equal((await operations.create(owner.id, expense, key)).id, first.id);
      await assert.rejects(operations.create(owner.id, { ...expense, amount: "60.00" }, key));
      await operations.create(
        owner.id,
        {
          kind: "transfer",
          amount: "100.00",
          accountId: card.id,
          targetAccountId: cash.id,
          note: "",
          occurredAt: when,
        },
        randomUUID(),
      );
      const refund = await operations.create(
        owner.id,
        {
          kind: "refund",
          amount: "20.00",
          accountId: card.id,
          parentId: first.id,
          note: "",
          occurredAt: when,
        },
        randomUUID(),
      );
      const summary = await reports.summary(owner.id);
      assert.equal(summary.netExpense, "30.00");
      const accounts = await accountsService.list(owner.id);
      assert.equal(accounts.find((a) => a.id === card.id)?.balance, "-130.00");
      assert.equal(accounts.find((a) => a.id === cash.id)?.balance, "100.00");
      await operations.remove(owner.id, refund.id, refund.version);
      assert.equal((await reports.summary(owner.id)).netExpense, "50.00");
    } finally {
      await db.entry.deleteMany({ where: { operation: { ownerId: owner.id } } });
      await db.operation.deleteMany({ where: { ownerId: owner.id } });
      await db.category.deleteMany({ where: { ownerId: owner.id } });
      await db.account.deleteMany({ where: { ownerId: owner.id } });
      await db.owner.delete({ where: { id: owner.id } });
      await db.$disconnect();
    }
  },
);

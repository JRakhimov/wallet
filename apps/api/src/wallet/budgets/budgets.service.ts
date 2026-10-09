import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class BudgetsService {
  constructor(private readonly db: PrismaService) {}

  async set(ownerId: string, month: string, amount: string) {
    const budget = await this.db.budget.upsert({
      where: { ownerId_month: { ownerId, month } },
      create: { ownerId, month, amount },
      update: { amount },
    });
    return { month, amount: budget.amount.toFixed(2) };
  }
}

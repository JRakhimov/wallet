import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  async onModuleInit() {
    await this.$connect();
  }
  async onApplicationShutdown() {
    await this.$disconnect();
  }
  // One owner, one short write lock: serializes refunds, balances and retries.
  ownerTransaction<T>(ownerId: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Owner" WHERE id = ${ownerId}::uuid FOR UPDATE`;
        return work(tx);
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Enough for preferences and habits; every fact goes into each request to the model. */
const MAX_FACTS = 50;
const MAX_FACT_LENGTH = 300;

/** Facts the assistant keeps about the person, e.g. "такси — всегда категория Транспорт". */
@Injectable()
export class MemoryService {
  constructor(private readonly db: PrismaService) {}

  async list(ownerId: string) {
    const facts = await this.db.assistantMemory.findMany({
      where: { ownerId },
      orderBy: { createdAt: "asc" },
    });

    return facts.map(({ id, text }) => ({ id, text }));
  }

  async add(ownerId: string, text: string) {
    const fact = text.trim().slice(0, MAX_FACT_LENGTH);
    if (!fact) {
      throw new BadRequestException("Нечего запоминать");
    }

    const count = await this.db.assistantMemory.count({ where: { ownerId } });
    if (count >= MAX_FACTS) {
      throw new BadRequestException("Память заполнена. Сначала попросите что-нибудь забыть");
    }

    const created = await this.db.assistantMemory.create({ data: { ownerId, text: fact } });

    return { id: created.id, text: created.text };
  }

  async remove(ownerId: string, id: string) {
    const fact = await this.db.assistantMemory.findFirst({ where: { id, ownerId } });
    if (!fact) {
      throw new NotFoundException("Такого факта в памяти нет");
    }

    await this.db.assistantMemory.delete({ where: { id } });

    return { id: fact.id, text: fact.text };
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, WeightEntry } from "@prisma/client";
import { DateTime } from "luxon";
import { OwnerService } from "../../owner/owner.service";
import { PrismaService } from "../../prisma/prisma.service";
import { WeightDto } from "./dto/weight.dto";
import { weightSummary } from "./summary";

type Tx = Prisma.TransactionClient;

export function weightEntryView(entry: WeightEntry) {
  return { id: entry.id, date: entry.date, weightKg: entry.weightKg.toNumber() };
}

/** Weight log. The latest weigh-in is the profile's weight, so the daily targets follow it. */
@Injectable()
export class WeightService {
  constructor(
    private readonly db: PrismaService,
    private readonly owners: OwnerService,
  ) {}

  /** All weigh-ins, oldest first, with the current weight and its change over 7 and 30 days. */
  async list(ownerId: string) {
    const rows = await this.db.weightEntry.findMany({
      where: { ownerId },
      orderBy: { date: "asc" },
    });
    const entries = rows.map(weightEntryView);

    return { entries, ...weightSummary(entries) };
  }

  /** Saves the day's weigh-in; a second one on the same day replaces the first. */
  async record(ownerId: string, input: WeightDto) {
    const profile = await this.db.nutritionProfile.findUnique({ where: { ownerId } });
    if (!profile) {
      throw new BadRequestException("Сначала заполните профиль");
    }

    const timezone = await this.owners.getTimezone(ownerId);
    const today = DateTime.now().setZone(timezone).toISODate()!;
    if (input.date > today) {
      throw new BadRequestException("Дата не может быть в будущем");
    }

    const weightKg = Math.round(input.weightKg * 10) / 10;

    await this.db.$transaction(async (tx) => {
      await tx.weightEntry.upsert({
        where: { ownerId_date: { ownerId, date: input.date } },
        create: { ownerId, date: input.date, weightKg },
        update: { weightKg },
      });

      await this.syncProfile(tx, ownerId);
    });

    return this.list(ownerId);
  }

  async remove(ownerId: string, id: string) {
    const entry = await this.db.weightEntry.findFirst({ where: { id, ownerId } });
    if (!entry) {
      throw new NotFoundException("Запись не найдена");
    }

    await this.db.$transaction(async (tx) => {
      await tx.weightEntry.delete({ where: { id } });

      await this.syncProfile(tx, ownerId);
    });

    return this.list(ownerId);
  }

  /** The profile takes the latest weigh-in; with no weigh-ins left it keeps its weight. */
  private async syncProfile(tx: Tx, ownerId: string) {
    const latest = await tx.weightEntry.findFirst({
      where: { ownerId },
      orderBy: { date: "desc" },
    });
    if (!latest) {
      return;
    }

    await tx.nutritionProfile.updateMany({
      where: { ownerId },
      data: { weightKg: latest.weightKg },
    });
  }
}

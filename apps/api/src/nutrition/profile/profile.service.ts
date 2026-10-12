import { BadRequestException, Injectable } from "@nestjs/common";
import { NutritionProfile } from "@prisma/client";
import { DateTime } from "luxon";
import { OwnerService } from "../../owner/owner.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SaveProfileDto, UpdateTargetsDto } from "./dto/profile.dto";
import { profileView } from "./profile.view";

@Injectable()
export class ProfileService {
  constructor(
    private readonly db: PrismaService,
    private readonly owners: OwnerService,
  ) {}

  /** Profile with targets, or null until onboarding is completed. */
  async get(ownerId: string) {
    const row = await this.db.nutritionProfile.findUnique({ where: { ownerId } });
    return row ? this.view(row) : null;
  }

  /**
   * Creates or updates body data and goal. Manual targets are kept. A new weight is also
   * written to the weight log as today's weigh-in, so the log and the profile agree.
   */
  async save(ownerId: string, input: SaveProfileDto) {
    const data = {
      ...input,
      birthDate: new Date(input.birthDate),
      weightKg: Math.round(input.weightKg * 10) / 10,
    };

    const existing = await this.db.nutritionProfile.findUnique({ where: { ownerId } });
    const weightChanged = !existing || existing.weightKg.toNumber() !== data.weightKg;
    const timezone = await this.owners.getTimezone(ownerId);
    const today = DateTime.now().setZone(timezone).toISODate()!;

    const row = await this.db.$transaction(async (tx) => {
      const profile = await tx.nutritionProfile.upsert({
        where: { ownerId },
        create: { ownerId, ...data },
        update: data,
      });

      if (weightChanged) {
        await tx.weightEntry.upsert({
          where: { ownerId_date: { ownerId, date: today } },
          create: { ownerId, date: today, weightKg: data.weightKg },
          update: { weightKg: data.weightKg },
        });
      }

      return profile;
    });

    return this.view(row);
  }

  async updateTargets(ownerId: string, targets: UpdateTargetsDto) {
    const existing = await this.db.nutritionProfile.findUnique({ where: { ownerId } });
    if (!existing) {
      throw new BadRequestException("Сначала заполните профиль");
    }
    const row = await this.db.nutritionProfile.update({
      where: { ownerId },
      data: {
        kcalOverride: targets.kcal,
        proteinGOverride: targets.proteinG,
        fatGOverride: targets.fatG,
        carbsGOverride: targets.carbsG,
      },
    });
    return this.view(row);
  }

  /** Age depends on the owner's current date, so the plan is computed in their timezone. */
  private async view(row: NutritionProfile) {
    const timezone = await this.owners.getTimezone(row.ownerId);
    const today = new Date(DateTime.now().setZone(timezone).toISODate()!);
    return profileView(row, today);
  }
}

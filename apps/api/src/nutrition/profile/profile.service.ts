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

  /** Creates or updates body data and goal. Manual targets are kept. */
  async save(ownerId: string, input: SaveProfileDto) {
    const data = {
      ...input,
      birthDate: new Date(input.birthDate),
      weightKg: Math.round(input.weightKg * 10) / 10,
    };
    const row = await this.db.nutritionProfile.upsert({
      where: { ownerId },
      create: { ownerId, ...data },
      update: data,
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

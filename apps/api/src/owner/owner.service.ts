import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { defaultAccount, defaultCategories } from "./default-owner-data";
import { UpdateSettingsDto } from "./dto/update-settings.dto";

@Injectable()
export class OwnerService {
  constructor(private readonly db: PrismaService) {}

  async getProfile(ownerId: string) {
    const owner = await this.db.owner.findUniqueOrThrow({ where: { id: ownerId } });
    return {
      id: owner.id,
      name: owner.name,
      timezone: owner.timezone,
      theme: owner.theme,
      currency: "UZS",
    };
  }

  async getTimezone(ownerId: string) {
    return (await this.getProfile(ownerId)).timezone;
  }

  async updateSettings(ownerId: string, settings: UpdateSettingsDto) {
    await this.db.owner.update({ where: { id: ownerId }, data: settings });
    return this.getProfile(ownerId);
  }

  /** Returns the owner, creating it with starter data on first login. */
  ensureOwner(telegramId: bigint) {
    return this.db.owner.upsert({
      where: { telegramId },
      update: {},
      create: {
        telegramId,
        accounts: { create: defaultAccount },
        categories: { create: defaultCategories },
      },
    });
  }
}

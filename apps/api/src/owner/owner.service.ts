import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { OwnerSetupRegistry } from "./owner-setup.registry";

@Injectable()
export class OwnerService {
  constructor(
    private readonly db: PrismaService,
    private readonly setups: OwnerSetupRegistry,
  ) {}

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

  /** Returns the owner, creating it with every app's starter data on first login. */
  async ensureOwner(telegramId: bigint) {
    const existing = await this.db.owner.findUnique({ where: { telegramId } });
    if (existing) {
      return existing;
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const owner = await tx.owner.create({ data: { telegramId } });
        await this.setups.runAll(tx, owner.id);
        return owner;
      });
    } catch (error) {
      // Two first logins at once: the other request created the owner.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return this.db.owner.findUniqueOrThrow({ where: { telegramId } });
      }
      throw error;
    }
  }
}

import { Inject, Injectable } from "@nestjs/common";
import { AppConfig, CONFIG } from "../config/app-config";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Who may use the apps: the administrator (OWNER_TELEGRAM_ID) and everyone the administrator
 * let in with /access. Anyone else is turned away.
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly db: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  isAdmin(telegramId: bigint) {
    return telegramId === this.config.ownerTelegramId;
  }

  async isAllowed(telegramId: bigint) {
    if (this.isAdmin(telegramId)) {
      return true;
    }

    return (await this.db.accessGrant.findUnique({ where: { telegramId } })) !== null;
  }

  /** Telegram ids of everyone who may use the apps, the administrator first. */
  async allowedIds() {
    const grants = await this.db.accessGrant.findMany({ orderBy: { grantedAt: "asc" } });
    return [this.config.ownerTelegramId, ...grants.map((grant) => grant.telegramId)];
  }

  /** Returns false when the user already had access. */
  async grant(telegramId: bigint) {
    if (await this.isAllowed(telegramId)) {
      return false;
    }

    await this.db.accessGrant.create({ data: { telegramId } });

    return true;
  }

  /** Returns false when there was nothing to take away. The administrator cannot be revoked. */
  async revoke(telegramId: bigint) {
    if (this.isAdmin(telegramId)) {
      return false;
    }

    const { count } = await this.db.accessGrant.deleteMany({ where: { telegramId } });
    // Sessions die with the access, so the person is signed out at once.
    await this.db.session.deleteMany({ where: { owner: { telegramId } } });

    return count > 0;
  }
}

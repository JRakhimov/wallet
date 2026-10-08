import { Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { sha256 } from "../common/utils/hash";
import { AppConfig, CONFIG } from "../config/app-config";
import { OwnerService } from "../owner/owner.service";
import { PrismaService } from "../prisma/prisma.service";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly db: PrismaService,
    private readonly owners: OwnerService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** Creates a session for the configured owner. Call only after the caller is verified. */
  async login() {
    const owner = await this.owners.ensureOwner(this.config.ownerTelegramId);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.db.session.create({
      data: { tokenHash: sha256(token), ownerId: owner.id, expiresAt },
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      mode: this.config.dev ? "dev" : "telegram",
    };
  }

  async logout(sessionHash: string) {
    await this.db.session.deleteMany({ where: { tokenHash: sessionHash } });
    return { ok: true };
  }
}

import { Controller, Get } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly db: PrismaService) {}

  /** Succeeds only when the database is reachable. */
  @Public()
  @Get()
  async check() {
    await this.db.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}

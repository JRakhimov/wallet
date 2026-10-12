import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { AccessService } from "../access/access.service";
import { BriefingComposer } from "../assistant/briefing";
import { AssistantSettingsService, AssistantSettingsView } from "../assistant/settings.service";
import { AppConfig, CONFIG } from "../config/app-config";
import { PrismaService } from "../prisma/prisma.service";
import { GRACE_MINUTES } from "./reminders";
import { MiniApp, TelegramBotService } from "./telegram-bot.service";

const TICK_MS = 60_000;
const SUNDAY = 7;
const WEEKLY_REPORT_AT = "20:00";

type BriefingKind = "morning_brief" | "weekly_report";

type Recipient = { id: string; telegramId: bigint; timezone: string };

/** Whether `time` (HH:mm) has come today and the grace period after it has not passed. */
export function isDue(local: DateTime, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const start = local.startOf("day").set({ hour, minute });

  return local >= start && local < start.plus({ minutes: GRACE_MINUTES });
}

/** The bot's own messages that are due for an owner now. */
export function dueBriefings(local: DateTime, settings: AssistantSettingsView): BriefingKind[] {
  const due: BriefingKind[] = [];

  if (settings.morningBriefAt && isDue(local, settings.morningBriefAt)) {
    due.push("morning_brief");
  }

  if (settings.weeklyReport && local.weekday === SUNDAY && isDue(local, WEEKLY_REPORT_AT)) {
    due.push("weekly_report");
  }

  return due;
}

/**
 * Sends every user with access the morning brief at their chosen time and the weekly report
 * on Sunday evening, in their timezone. Each goes out once a day, also across restarts.
 */
@Injectable()
export class BriefingService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BriefingService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly db: PrismaService,
    private readonly bot: TelegramBotService,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly access: AccessService,
    private readonly settings: AssistantSettingsService,
    private readonly composer: BriefingComposer,
  ) {}

  onApplicationBootstrap() {
    // Same rule as the bot: a local dev API must not message real users.
    if (this.config.dev && !this.config.botInDev) {
      return;
    }

    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Sends whatever is due; safe to call repeatedly. */
  async tick(now: DateTime = DateTime.now()) {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const owners = await this.db.owner.findMany({
        where: { telegramId: { in: await this.access.allowedIds() } },
        select: { id: true, telegramId: true, timezone: true },
      });

      for (const owner of owners) {
        await this.brief(owner, now);
      }
    } catch {
      this.logger.warn("Briefing check failed");
    } finally {
      this.running = false;
    }
  }

  /** One owner failing does not stop the others. */
  private async brief(owner: Recipient, now: DateTime) {
    try {
      const local = now.setZone(owner.timezone);
      const settings = await this.settings.get(owner.id);

      for (const kind of dueBriefings(local, settings)) {
        await this.send(kind, owner, local);
      }
    } catch {
      this.logger.warn("Briefing check failed");
    }
  }

  private async send(kind: BriefingKind, owner: Recipient, local: DateTime) {
    const key = { ownerId: owner.id, kind, date: local.toISODate()! };
    if (!(await this.claim(key))) {
      return;
    }

    try {
      const text =
        kind === "morning_brief"
          ? await this.composer.morning(owner.id, local)
          : await this.composer.weekly(owner.id, local);

      await this.bot.sendTo(owner.telegramId, text, { silent: false, apps: appsOf(kind) });

      await this.db.reminder.update({ where: { ownerId_kind_date: key }, data: { sent: true } });
    } catch {
      // Let the next tick try again within the grace period.
      await this.db.reminder.delete({ where: { ownerId_kind_date: key } });
      this.logger.warn(`Could not send the ${kind}`);
    }
  }

  /** Returns false when this one already went out today. */
  private async claim(key: { ownerId: string; kind: BriefingKind; date: string }) {
    try {
      await this.db.reminder.create({ data: key });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return false;
      }
      throw error;
    }
  }
}

function appsOf(kind: BriefingKind): MiniApp[] {
  return kind === "morning_brief" ? ["tasks"] : ["wallet", "nutrition"];
}

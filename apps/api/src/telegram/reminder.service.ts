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
import { AppConfig, CONFIG } from "../config/app-config";
import { PrismaService } from "../prisma/prisma.service";
import { DayState, DINNER_FROM_HOUR, dueReminders, ReminderKind, reminderFor } from "./reminders";
import { TelegramBotService } from "./telegram-bot.service";

const TICK_MS = 60_000;

/**
 * Reminds every user with access, with sound, to log meals and expenses: a check at 14:00 and
 * at 20:00 in the user's timezone. Each check runs once per day, also across restarts.
 */
@Injectable()
export class ReminderService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReminderService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly db: PrismaService,
    private readonly bot: TelegramBotService,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly access: AccessService,
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

  /** Runs every check that is due; safe to call repeatedly. */
  async tick(now: DateTime = DateTime.now()) {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const owners = await this.db.owner.findMany({
        where: { telegramId: { in: await this.access.allowedIds() } },
        include: { nutritionProfile: { select: { ownerId: true } } },
      });
      for (const owner of owners) {
        await this.remind(owner, now);
      }
    } catch {
      this.logger.warn("Reminder check failed");
    } finally {
      this.running = false;
    }
  }

  /** Runs this owner's due checks. One owner failing does not stop the others. */
  private async remind(
    owner: { id: string; telegramId: bigint; timezone: string; nutritionProfile: object | null },
    now: DateTime,
  ) {
    try {
      const local = now.setZone(owner.timezone);
      for (const kind of dueReminders(local)) {
        await this.check(kind, owner, local);
      }
    } catch {
      this.logger.warn("Reminder check failed");
    }
  }

  private async check(
    kind: ReminderKind,
    owner: { id: string; telegramId: bigint; nutritionProfile: object | null },
    local: DateTime,
  ) {
    const date = local.toISODate()!;
    const key = { ownerId: owner.id, kind, date };
    if (!(await this.claim(key))) {
      return;
    }
    const reminder = reminderFor(
      kind,
      await this.dayState(owner.id, Boolean(owner.nutritionProfile), local),
    );
    if (!reminder) {
      return;
    }
    try {
      await this.bot.sendTo(owner.telegramId, reminder.text, {
        silent: false,
        apps: reminder.apps,
      });
      await this.db.reminder.update({
        where: { ownerId_kind_date: key },
        data: { sent: true },
      });
    } catch {
      // Let the next tick try again within the grace period.
      await this.db.reminder.delete({ where: { ownerId_kind_date: key } });
      this.logger.warn(`Could not send the ${kind} reminder`);
    }
  }

  /** Returns false when this check already ran today. */
  private async claim(key: { ownerId: string; kind: ReminderKind; date: string }) {
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

  private async dayState(
    ownerId: string,
    tracksMeals: boolean,
    local: DateTime,
  ): Promise<DayState> {
    const start = local.startOf("day");
    const range = { gte: start.toJSDate(), lt: start.plus({ days: 1 }).toJSDate() };
    const dinnerFrom = start.plus({ hours: DINNER_FROM_HOUR }).toJSDate();
    // A meal still being recognized or waiting for review counts: the owner did add it.
    const meals = { ownerId, deletedAt: null, status: { not: "failed" } };

    const [mealsToday, dinners, expensesToday] = await Promise.all([
      this.db.meal.count({ where: { ...meals, eatenAt: range } }),
      this.db.meal.count({ where: { ...meals, eatenAt: { gte: dinnerFrom, lt: range.lt } } }),
      this.db.operation.count({
        where: { ownerId, deletedAt: null, kind: "expense", occurredAt: range },
      }),
    ]);
    return { tracksMeals, mealsToday, dinnerLogged: dinners > 0, expensesToday };
  }
}

import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { AppConfig, CONFIG } from "../config/app-config";
import { PrismaService } from "../prisma/prisma.service";
import { DayState, DINNER_FROM_HOUR, dueReminders, ReminderKind, reminderFor } from "./reminders";
import { TelegramBotService } from "./telegram-bot.service";

const TICK_MS = 60_000;

/**
 * Reminds the owner, with sound, to log meals and expenses: a check at 14:00 and at 20:00 in
 * the owner's timezone. Each check runs once per day, also across restarts.
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
  ) {}

  onApplicationBootstrap() {
    // Same rule as the bot: a local dev API must not message the real owner.
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
      const owner = await this.db.owner.findUnique({
        where: { telegramId: this.config.ownerTelegramId },
        include: { nutritionProfile: { select: { ownerId: true } } },
      });
      if (!owner) {
        return;
      }
      const local = now.setZone(owner.timezone);
      for (const kind of dueReminders(local)) {
        await this.check(kind, owner.id, Boolean(owner.nutritionProfile), local);
      }
    } catch {
      this.logger.warn("Reminder check failed");
    } finally {
      this.running = false;
    }
  }

  private async check(kind: ReminderKind, ownerId: string, tracksMeals: boolean, local: DateTime) {
    const date = local.toISODate()!;
    if (!(await this.claim(kind, date))) {
      return;
    }
    const reminder = reminderFor(kind, await this.dayState(ownerId, tracksMeals, local));
    if (!reminder) {
      return;
    }
    try {
      await this.bot.sendToOwner(reminder.text, { silent: false, apps: reminder.apps });
      await this.db.reminder.update({ where: { kind_date: { kind, date } }, data: { sent: true } });
    } catch {
      // Let the next tick try again within the grace period.
      await this.db.reminder.delete({ where: { kind_date: { kind, date } } });
      this.logger.warn(`Could not send the ${kind} reminder`);
    }
  }

  /** Returns false when this check already ran today. */
  private async claim(kind: ReminderKind, date: string) {
    try {
      await this.db.reminder.create({ data: { kind, date } });
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

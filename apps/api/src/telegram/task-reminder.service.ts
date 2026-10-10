import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { Prisma, Task } from "@prisma/client";
import { DateTime } from "luxon";
import { AccessService } from "../access/access.service";
import { AppConfig, CONFIG } from "../config/app-config";
import { PrismaService } from "../prisma/prisma.service";
import { dueLabel, repeatLabel } from "../tasks/labels";
import { advance, Repeat } from "../tasks/recurrence";
import { scheduleOf } from "../tasks/tasks.service";
import { taskButtons, TelegramBotService } from "./telegram-bot.service";

const TICK_MS = 60_000;
/** Keeps one tick short even if many reminders piled up during a restart. */
const BATCH_SIZE = 50;

type DueTask = Task & { owner: { telegramId: bigint; timezone: string } };

/** The reminder message: title, when it was due, how it repeats and the note. */
export function taskReminderText(task: Task, timezone: string, snoozed: boolean) {
  const lines = [`🔔 ${task.title}`];
  const today = DateTime.now().setZone(timezone);

  const when = [
    task.dueDate && !snoozed ? dueLabel(task.dueDate, task.dueTime, today) : "",
    repeatLabel(task.repeat as Repeat, task.repeatDays, task.anchorDate),
  ].filter(Boolean);

  if (when.length) {
    lines.push(capitalize(when.join(" · ")));
  }

  if (task.note) {
    lines.push("", task.note);
  }

  return lines.join("\n");
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Sends task reminders on time, with sound and buttons. A repeating task moves on to its next
 * date as soon as its reminder is sent; a reminder put off with a button comes back once.
 */
@Injectable()
export class TaskReminderService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TaskReminderService.name);
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

  /** Sends every reminder that is due; safe to call repeatedly. */
  async tick(now: Date = new Date()) {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const tasks = await this.db.task.findMany({
        where: {
          doneAt: null,
          deletedAt: null,
          owner: { telegramId: { in: await this.access.allowedIds() } },
          OR: [{ remindAt: { lte: now } }, { snoozeAt: { lte: now } }],
        },
        include: { owner: { select: { telegramId: true, timezone: true } } },
        orderBy: { remindAt: "asc" },
        take: BATCH_SIZE,
      });

      for (const task of tasks) {
        await this.remind(task, now);
      }
    } catch {
      this.logger.warn("Task reminder check failed");
    } finally {
      this.running = false;
    }
  }

  /** One task failing does not stop the others. */
  private async remind(task: DueTask, now: Date) {
    try {
      const snoozed = task.snoozeAt !== null && task.snoozeAt <= now;
      const claimed = await this.claim(task, snoozed, now);
      if (!claimed) {
        return;
      }

      try {
        await this.bot.sendTo(
          task.owner.telegramId,
          taskReminderText(task, task.owner.timezone, snoozed),
          { silent: false, buttons: taskButtons(task.id), apps: ["tasks"] },
        );
      } catch {
        // Put the reminder back so the next tick tries again.
        await this.restore(task);
        this.logger.warn("Could not send a task reminder");
      }
    } catch {
      this.logger.warn("Task reminder failed");
    }
  }

  /**
   * Moves the task past this reminder before sending, so it goes out once even if two ticks
   * overlap. The version check makes the claim fail if the task was changed meanwhile.
   */
  private async claim(task: DueTask, snoozed: boolean, now: Date) {
    const result = await this.db.task.updateMany({
      where: { id: task.id, version: task.version },
      data: { ...this.afterReminder(task, snoozed, now), version: { increment: 1 } },
    });

    return result.count === 1;
  }

  private afterReminder(
    task: DueTask,
    snoozed: boolean,
    now: Date,
  ): Prisma.TaskUpdateManyMutationInput {
    if (snoozed) {
      return { snoozeAt: null };
    }

    const next = advance(scheduleOf(task), now, task.owner.timezone);

    return next ?? { remindAt: null };
  }

  private async restore(task: DueTask) {
    await this.db.task.updateMany({
      where: { id: task.id, version: task.version + 1 },
      data: {
        dueDate: task.dueDate,
        remindAt: task.remindAt,
        snoozeAt: task.snoozeAt,
        version: { increment: 1 },
      },
    });
  }
}

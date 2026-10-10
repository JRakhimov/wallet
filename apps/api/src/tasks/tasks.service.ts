import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Task } from "@prisma/client";
import { DateTime } from "luxon";
import { OwnerService } from "../owner/owner.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTaskDto, UpdateTaskDto } from "./dto/task.dto";
import { advance, remindAtFor, Repeat, Schedule } from "./recurrence";

/** Done tasks stay in the list this long, so a mistaken tick can be undone. */
const DONE_VISIBLE_DAYS = 7;

export function taskView(task: Task) {
  return {
    id: task.id,
    title: task.title,
    note: task.note,
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    repeat: task.repeat as Repeat,
    repeatDays: task.repeatDays,
    doneAt: task.doneAt?.toISOString() ?? null,
    snoozeAt: task.snoozeAt?.toISOString() ?? null,
    version: task.version,
    createdAt: task.createdAt.toISOString(),
  };
}

export type TaskView = ReturnType<typeof taskView>;

export function scheduleOf(task: Task): Schedule {
  return {
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    repeat: task.repeat as Repeat,
    repeatDays: task.repeatDays,
    anchorDate: task.anchorDate,
  };
}

/**
 * When the task is due and reminded. A reminder already in the past is not sent: a one-off
 * task simply shows as overdue, a repeating one moves on to its next date.
 */
export function plan(schedule: Schedule, timezone: string, now: Date) {
  const remindAt = remindAtFor(schedule, timezone);
  if (!remindAt || remindAt > now) {
    return { dueDate: schedule.dueDate, remindAt };
  }

  return advance(schedule, now, timezone) ?? { dueDate: schedule.dueDate, remindAt: null };
}

/** Tasks and notes (a note is a task without a date). The bot reminds about them on time. */
@Injectable()
export class TasksService {
  constructor(
    private readonly db: PrismaService,
    private readonly owners: OwnerService,
  ) {}

  /** Open tasks and the ones done recently. */
  async list(ownerId: string) {
    const doneSince = DateTime.now().minus({ days: DONE_VISIBLE_DAYS }).toJSDate();

    const tasks = await this.db.task.findMany({
      where: {
        ownerId,
        deletedAt: null,
        OR: [{ doneAt: null }, { doneAt: { gte: doneSince } }],
      },
      orderBy: { createdAt: "asc" },
    });

    return tasks.map(taskView);
  }

  /** Idempotent: repeating a request with the same key returns the same task. */
  async create(ownerId: string, input: CreateTaskDto, idempotencyKey: string) {
    const existing = await this.db.task.findUnique({
      where: { ownerId_idempotencyKey: { ownerId, idempotencyKey } },
    });
    if (existing) {
      return taskView(existing);
    }

    const schedule = this.scheduleFrom(input);
    const timezone = await this.owners.getTimezone(ownerId);
    const { dueDate, remindAt } = plan(schedule, timezone, new Date());

    const task = await this.db.task.create({
      data: {
        ownerId,
        idempotencyKey,
        title: input.title,
        note: input.note,
        ...schedule,
        dueDate,
        remindAt,
      },
    });

    return taskView(task);
  }

  async update(ownerId: string, id: string, input: UpdateTaskDto) {
    await this.find(ownerId, id, input.version);

    const schedule = this.scheduleFrom(input);
    const timezone = await this.owners.getTimezone(ownerId);
    const { dueDate, remindAt } = plan(schedule, timezone, new Date());

    const task = await this.db.task.update({
      where: { id },
      data: {
        title: input.title,
        note: input.note,
        ...schedule,
        dueDate,
        remindAt,
        snoozeAt: null,
        version: { increment: 1 },
      },
    });

    return taskView(task);
  }

  /** A one-off task is marked done; a repeating one moves on to its next date. */
  async complete(ownerId: string, id: string, version?: number) {
    const task = await this.find(ownerId, id, version);
    if (task.doneAt) {
      return taskView(task);
    }

    const timezone = await this.owners.getTimezone(ownerId);
    const next = advance(scheduleOf(task), new Date(), timezone);

    const data: Prisma.TaskUpdateInput = next
      ? { dueDate: next.dueDate, remindAt: next.remindAt }
      : { doneAt: new Date(), remindAt: null };

    const updated = await this.db.task.update({
      where: { id },
      data: { ...data, snoozeAt: null, version: { increment: 1 } },
    });

    return taskView(updated);
  }

  async reopen(ownerId: string, id: string, version: number) {
    const task = await this.find(ownerId, id, version);

    const timezone = await this.owners.getTimezone(ownerId);
    const { dueDate, remindAt } = plan(scheduleOf(task), timezone, new Date());

    const updated = await this.db.task.update({
      where: { id },
      data: { doneAt: null, dueDate, remindAt, version: { increment: 1 } },
    });

    return taskView(updated);
  }

  async remove(ownerId: string, id: string, version: number) {
    await this.find(ownerId, id, version);

    await this.db.task.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });

    return { ok: true };
  }

  /** "Remind later" from the bot; the due date stays as it is. */
  async snooze(ownerId: string, id: string, until: Date) {
    await this.find(ownerId, id);

    const task = await this.db.task.update({
      where: { id },
      data: { snoozeAt: until, version: { increment: 1 } },
    });

    return taskView(task);
  }

  /** A task of the owner with this Telegram id, for the bot's buttons. */
  async findForTelegram(telegramId: bigint, id: string) {
    return this.db.task.findFirst({
      where: { id, deletedAt: null, owner: { telegramId } },
      include: { owner: { select: { id: true, timezone: true } } },
    });
  }

  private scheduleFrom(input: CreateTaskDto): Schedule {
    return {
      dueDate: input.dueDate,
      dueTime: input.dueDate ? input.dueTime : null,
      repeat: input.repeat,
      repeatDays: input.repeat === "weekly" ? [...new Set(input.repeatDays)].sort() : [],
      anchorDate: input.repeat === "none" ? null : input.dueDate,
    };
  }

  /** Throws when the task is missing or, if a version is given, was changed meanwhile. */
  private async find(ownerId: string, id: string, version?: number) {
    const task = await this.db.task.findFirst({ where: { id, ownerId, deletedAt: null } });
    if (!task) {
      throw new NotFoundException("Задача не найдена");
    }

    if (version !== undefined && task.version !== version) {
      throw new ConflictException("Задача уже изменена. Обновите список");
    }

    return task;
  }
}

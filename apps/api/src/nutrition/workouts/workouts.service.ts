import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Workout } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { WorkoutDto } from "./dto/workout.dto";

export function workoutView(workout: Workout) {
  return {
    id: workout.id,
    performedAt: workout.performedAt.toISOString(),
    kcal: workout.kcal,
    durationMin: workout.durationMin,
    note: workout.note,
  };
}

export type WorkoutView = ReturnType<typeof workoutView>;

/** Workouts: calories burned, shown next to the diary; they never change daily targets. */
@Injectable()
export class WorkoutsService {
  constructor(private readonly db: PrismaService) {}

  /** Idempotent: repeating a request with the same key returns the same workout. */
  async create(ownerId: string, input: WorkoutDto, idempotencyKey: string) {
    const existing = await this.db.workout.findUnique({
      where: { ownerId_idempotencyKey: { ownerId, idempotencyKey } },
    });
    if (existing) {
      return workoutView(existing);
    }
    const workout = await this.db.workout.create({
      data: {
        ownerId,
        idempotencyKey,
        performedAt: new Date(input.performedAt),
        kcal: input.kcal,
        durationMin: input.durationMin,
        note: input.note,
      },
    });
    return workoutView(workout);
  }

  async update(ownerId: string, id: string, input: WorkoutDto) {
    await this.find(ownerId, id);
    const workout = await this.db.workout.update({
      where: { id },
      data: {
        performedAt: new Date(input.performedAt),
        kcal: input.kcal,
        durationMin: input.durationMin,
        note: input.note,
      },
    });
    return workoutView(workout);
  }

  async remove(ownerId: string, id: string) {
    await this.find(ownerId, id);
    await this.db.workout.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /** Workouts in `[from, to)`, oldest first. */
  list(ownerId: string, range: { from: Date; to: Date }) {
    return this.db.workout.findMany({
      where: { ownerId, deletedAt: null, performedAt: { gte: range.from, lt: range.to } },
      orderBy: { performedAt: "asc" },
    });
  }

  private async find(ownerId: string, id: string) {
    const where: Prisma.WorkoutWhereInput = { id, ownerId, deletedAt: null };
    const workout = await this.db.workout.findFirst({ where });
    if (!workout) {
      throw new NotFoundException("Тренировка не найдена");
    }
    return workout;
  }
}

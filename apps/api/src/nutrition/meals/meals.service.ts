import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { OwnerService } from "../../owner/owner.service";
import { PrismaService } from "../../prisma/prisma.service";
import { MealAnalysis } from "../analysis/meal-analysis.schema";
import {
  MEAL_ANALYZER,
  MealAnalysisError,
  MealAnalysisInput,
  MealAnalysisResult,
  MealAnalyzer,
} from "../analysis/meal-analyzer";
import { PhotosService } from "../photos/photos.service";
import { AnalyzeMealDto, MealItemDto, SaveMealDto } from "./dto/meal.dto";
import { MealWithItems, mealView, StoredAnalysis, sumTotals, Totals } from "./meal.view";

/** Meals the owner never saved are removed after this time, with their photos. */
const DRAFT_TTL_HOURS = 24;
/** Recognition normally takes under a minute; an older "analyzing" meal was lost. */
const STALE_ANALYSIS_MINUTES = 5;

export type UploadedPhoto = { photo: Buffer; thumbnail: Buffer };

const withItems = { items: true } satisfies Prisma.MealInclude;

@Injectable()
export class MealsService {
  private readonly logger = new Logger(MealsService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly owners: OwnerService,
    private readonly photos: PhotosService,
    @Inject(MEAL_ANALYZER) private readonly analyzer: MealAnalyzer | null,
  ) {}

  /**
   * Stores the meal as "analyzing" and returns at once; the recognition itself runs in the
   * background and turns it into a draft (or marks it failed). The client polls `pending`.
   * Idempotent: repeating a request with the same key returns the same meal.
   */
  async analyze(
    ownerId: string,
    input: AnalyzeMealDto,
    upload: UploadedPhoto | null,
    idempotencyKey: string,
  ) {
    const existing = await this.db.meal.findUnique({
      where: { ownerId_idempotencyKey: { ownerId, idempotencyKey } },
      include: withItems,
    });
    if (existing) {
      return mealView(existing);
    }

    void this.removeAbandonedMeals(ownerId);

    const photo = upload ? await this.photos.save(ownerId, upload.photo, upload.thumbnail) : null;
    const meal = await this.db.meal.create({
      data: {
        ownerId,
        idempotencyKey,
        status: "analyzing",
        eatenAt: new Date(input.eatenAt),
        source: upload ? "photo" : "text",
        comment: input.comment,
        photoId: photo?.id ?? null,
        ...sumTotals([]),
      },
      include: withItems,
    });
    void this.finishAnalysis(meal.id, { comment: input.comment, photo: upload?.photo });
    return mealView(meal);
  }

  /** Meals still being recognized, failed ones and drafts waiting for review, newest first. */
  async pending(ownerId: string) {
    await this.failStaleAnalyses(ownerId);
    const meals = await this.db.meal.findMany({
      where: { ownerId, deletedAt: null, status: { in: ["analyzing", "failed", "draft"] } },
      include: withItems,
      orderBy: { createdAt: "desc" },
    });
    return { meals: meals.map(mealView) };
  }

  /** Starts recognition of a failed meal again. */
  async retry(ownerId: string, id: string) {
    const meal = await this.findMeal(ownerId, id);
    if (meal.status !== "failed") {
      throw new BadRequestException("Повторить можно только нераспознанный приём пищи");
    }
    const photo = meal.photoId ? await this.photos.read(ownerId, meal.photoId, "full") : undefined;
    const updated = await this.db.meal.update({
      where: { id },
      data: { status: "analyzing", error: null },
      include: withItems,
    });
    void this.finishAnalysis(id, { comment: meal.comment, photo });
    return mealView(updated);
  }

  /** Re-runs recognition of a draft with the owner's correction. */
  async reanalyze(ownerId: string, id: string, clarification: string) {
    const meal = await this.findMeal(ownerId, id);
    if (meal.status !== "draft") {
      throw new BadRequestException("Уточнить можно только новый приём пищи");
    }

    const photo = meal.photoId ? await this.photos.read(ownerId, meal.photoId, "full") : undefined;
    const analysis = await this.runAnalysis({
      comment: meal.comment,
      photo,
      clarification,
      previous: previousAnalysis(meal),
    });

    const updated = await this.db.$transaction(async (tx) => {
      await tx.mealItem.deleteMany({ where: { mealId: id } });
      return tx.meal.update({
        where: { id },
        data: {
          ...sumTotals(analysis.items),
          analysis: storedAnalysis(analysis, meal.analysis as StoredAnalysis | null, clarification),
          items: { create: itemsData(analysis.items) },
        },
        include: withItems,
      });
    });
    return mealView(updated);
  }

  /** Saves reviewed items: a draft becomes part of the diary; a saved meal is updated. */
  async save(ownerId: string, id: string, input: SaveMealDto) {
    const meal = await this.findMeal(ownerId, id);
    if (meal.status === "analyzing") {
      throw new BadRequestException("Приём пищи ещё распознаётся");
    }
    const updated = await this.db.$transaction(async (tx) => {
      await tx.mealItem.deleteMany({ where: { mealId: id } });
      return tx.meal.update({
        where: { id },
        data: {
          status: "confirmed",
          error: null,
          eatenAt: new Date(input.eatenAt),
          comment: input.comment,
          ...sumTotals(input.items),
          items: { create: itemsData(input.items) },
        },
        include: withItems,
      });
    });
    return mealView(updated);
  }

  async remove(ownerId: string, id: string) {
    await this.findMeal(ownerId, id);
    await this.db.meal.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  async get(ownerId: string, id: string) {
    return mealView(await this.findMeal(ownerId, id));
  }

  /** Saved meals of a calendar day in the owner's timezone, with day totals. */
  async day(ownerId: string, date: string) {
    const timezone = await this.owners.getTimezone(ownerId);
    const start = DateTime.fromISO(date, { zone: timezone }).startOf("day");
    if (!start.isValid) {
      throw new BadRequestException("Некорректная дата");
    }
    const meals = await this.db.meal.findMany({
      where: {
        ownerId,
        status: "confirmed",
        deletedAt: null,
        eatenAt: { gte: start.toJSDate(), lt: start.plus({ days: 1 }).toJSDate() },
      },
      include: withItems,
      orderBy: { eatenAt: "asc" },
    });
    const views = meals.map(mealView);
    return { date, totals: sumTotals(views.map((meal) => meal.totals)), meals: views };
  }

  /** Totals per day of a month (YYYY-MM) in the owner's timezone, newest day first. */
  async history(ownerId: string, month: string) {
    const timezone = await this.owners.getTimezone(ownerId);
    const start = DateTime.fromISO(`${month}-01`, { zone: timezone }).startOf("month");
    const meals = await this.db.meal.findMany({
      where: {
        ownerId,
        status: "confirmed",
        deletedAt: null,
        eatenAt: { gte: start.toJSDate(), lt: start.plus({ months: 1 }).toJSDate() },
      },
      select: { eatenAt: true, kcal: true, proteinG: true, fatG: true, carbsG: true },
    });

    const byDay = new Map<string, Totals[]>();
    for (const meal of meals) {
      const date = DateTime.fromJSDate(meal.eatenAt, { zone: timezone }).toISODate()!;
      const totals = {
        kcal: meal.kcal.toNumber(),
        proteinG: meal.proteinG.toNumber(),
        fatG: meal.fatG.toNumber(),
        carbsG: meal.carbsG.toNumber(),
      };
      byDay.set(date, [...(byDay.get(date) ?? []), totals]);
    }
    const days = [...byDay.entries()]
      .map(([date, list]) => ({ date, mealCount: list.length, totals: sumTotals(list) }))
      .sort((a, b) => b.date.localeCompare(a.date));
    return { month, days };
  }

  private async findMeal(ownerId: string, id: string): Promise<MealWithItems> {
    const meal = await this.db.meal.findFirst({
      where: { id, ownerId, deletedAt: null },
      include: withItems,
    });
    if (!meal) {
      throw new NotFoundException("Приём пищи не найден");
    }
    return meal;
  }

  private async runAnalysis(input: MealAnalysisInput): Promise<MealAnalysisResult> {
    if (!this.analyzer) {
      throw new ServiceUnavailableException("Распознавание еды не настроено на сервере");
    }
    try {
      return await this.analyzer.analyze(input);
    } catch (error) {
      if (error instanceof MealAnalysisError) {
        throw new BadGatewayException(error.message);
      }
      throw error;
    }
  }

  /** Runs in the background: never throws, the outcome is stored on the meal. */
  private async finishAnalysis(id: string, input: MealAnalysisInput) {
    try {
      const analysis = await this.runAnalysis(input);
      await this.db.$transaction(async (tx) => {
        // Skip if the owner deleted the meal meanwhile or it was already failed as stale.
        const claimed = await tx.meal.updateMany({
          where: { id, status: "analyzing", deletedAt: null },
          data: {
            status: "draft",
            error: null,
            ...sumTotals(analysis.items),
            analysis: storedAnalysis(analysis, null),
          },
        });
        if (claimed.count > 0) {
          await tx.mealItem.createMany({
            data: itemsData(analysis.items).map((item) => ({ ...item, mealId: id })),
          });
        }
      });
    } catch (error) {
      const message =
        error instanceof HttpException
          ? error.message
          : "Не удалось распознать еду. Попробуйте ещё раз";
      if (!(error instanceof HttpException)) {
        this.logger.error(`Meal analysis failed: ${String(error)}`);
      }
      await this.db.meal
        .updateMany({
          where: { id, status: "analyzing" },
          data: { status: "failed", error: message },
        })
        .catch(() => this.logger.error("Could not store the failed analysis"));
    }
  }

  /** The server restarted (or crashed) mid-recognition: nobody is going to finish these. */
  private async failStaleAnalyses(ownerId: string) {
    await this.db.meal.updateMany({
      where: {
        ownerId,
        status: "analyzing",
        updatedAt: { lt: DateTime.now().minus({ minutes: STALE_ANALYSIS_MINUTES }).toJSDate() },
      },
      data: { status: "failed", error: "Распознавание прервалось. Попробуйте ещё раз" },
    });
  }

  /** Best effort: a failure here must not break the request that triggered it. */
  private async removeAbandonedMeals(ownerId: string) {
    try {
      const abandoned = await this.db.meal.findMany({
        where: {
          ownerId,
          status: { not: "confirmed" },
          createdAt: { lt: DateTime.now().minus({ hours: DRAFT_TTL_HOURS }).toJSDate() },
        },
        select: { id: true, photoId: true },
      });
      for (const meal of abandoned) {
        await this.db.meal.delete({ where: { id: meal.id } });
        if (meal.photoId) {
          await this.photos.remove(meal.photoId);
        }
      }
    } catch {
      this.logger.warn("Could not remove abandoned meals");
    }
  }
}

function itemsData(items: (MealAnalysis["items"][number] | MealItemDto)[]) {
  return items.map((item, position) => ({
    position,
    name: item.name,
    grams: item.grams,
    kcal: item.kcal,
    proteinG: item.proteinG,
    fatG: item.fatG,
    carbsG: item.carbsG,
    confidence: item.confidence,
  }));
}

const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

/** The draft's current items as the model's previous answer, for a correction. */
function previousAnalysis(meal: MealWithItems): MealAnalysis {
  const view = mealView(meal);
  return {
    items: view.items.map((item) => ({
      ...item,
      confidence: CONFIDENCE_LEVELS.find((level) => level === item.confidence) ?? "medium",
    })),
    assumptions: view.assumptions,
    questions: view.questions,
  };
}

/** Keeps every provider call's meta and clarification for quality and cost checks. */
function storedAnalysis(
  analysis: MealAnalysisResult,
  previous: StoredAnalysis | null,
  clarification?: string,
): Prisma.InputJsonValue {
  const stored: StoredAnalysis = {
    assumptions: analysis.assumptions,
    questions: analysis.questions,
    clarifications: [
      ...(previous?.clarifications ?? []),
      ...(clarification ? [clarification] : []),
    ],
    meta: [...(previous?.meta ?? []), analysis.meta],
  };
  return stored;
}

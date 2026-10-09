import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { IdempotencyKey } from "../../common/decorators/idempotency-key.decorator";
import { OwnerId } from "../../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { parse } from "../../common/validation/parse";
import { uuid } from "../../common/validation/schemas";
import { MAX_PHOTO_BYTES } from "../photos/photos.service";
import {
  analyzeMealSchema,
  analyzePhotoMealSchema,
  ReanalyzeMealDto,
  reanalyzeMealSchema,
  SaveMealDto,
  saveMealSchema,
} from "./dto/meal.dto";
import { MealsService } from "./meals.service";

/** The part of a multer file we use; avoids depending on global Express.Multer types. */
type UploadedFile = { buffer: Buffer };
type MealUploads = { photo?: UploadedFile[]; thumbnail?: UploadedFile[] };

const idPipe = new ZodValidationPipe(uuid);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату в формате ГГГГ-ММ-ДД");

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Укажите месяц в формате ГГГГ-ММ");

const photoUploads = FileFieldsInterceptor(
  [
    { name: "photo", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ],
  { limits: { fileSize: MAX_PHOTO_BYTES, files: 2, fields: 4 } },
);

@Controller("nutrition")
export class MealsController {
  constructor(private readonly meals: MealsService) {}

  /** Multipart: `comment`, `eatenAt` and optional `photo` + `thumbnail` (JPEG). */
  @Post("meals/analyze")
  @UseInterceptors(photoUploads)
  analyze(
    @OwnerId() ownerId: string,
    @IdempotencyKey() idempotencyKey: string,
    @UploadedFiles() files: MealUploads | undefined,
    @Body() body: unknown,
  ) {
    const photo = files?.photo?.[0]?.buffer;
    const thumbnail = files?.thumbnail?.[0]?.buffer;
    if (Boolean(photo) !== Boolean(thumbnail)) {
      throw new BadRequestException("Нужны фото и его миниатюра");
    }
    const upload = photo && thumbnail ? { photo, thumbnail } : null;
    // With a photo the comment is optional; text-only mode needs a description.
    const input = parse(upload ? analyzePhotoMealSchema : analyzeMealSchema, body);
    return this.meals.analyze(ownerId, input, upload, idempotencyKey);
  }

  /** Meals still being recognized, failed ones and drafts waiting for review. */
  @Get("meals/pending")
  pending(@OwnerId() ownerId: string) {
    return this.meals.pending(ownerId);
  }

  /** Starts recognition of a failed meal again. */
  @Post("meals/:id/retry")
  retry(@OwnerId() ownerId: string, @Param("id", idPipe) id: string) {
    return this.meals.retry(ownerId, id);
  }

  @Post("meals/:id/reanalyze")
  reanalyze(
    @OwnerId() ownerId: string,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(reanalyzeMealSchema)) body: ReanalyzeMealDto,
  ) {
    return this.meals.reanalyze(ownerId, id, body.clarification);
  }

  @Get("meals/:id")
  get(@OwnerId() ownerId: string, @Param("id", idPipe) id: string) {
    return this.meals.get(ownerId, id);
  }

  /** Saves reviewed items; a draft becomes part of the diary. */
  @Put("meals/:id")
  save(
    @OwnerId() ownerId: string,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(saveMealSchema)) body: SaveMealDto,
  ) {
    return this.meals.save(ownerId, id, body);
  }

  @Delete("meals/:id")
  remove(@OwnerId() ownerId: string, @Param("id", idPipe) id: string) {
    return this.meals.remove(ownerId, id);
  }

  /** Totals per day of a month, newest day first. */
  @Get("history/:month")
  history(
    @OwnerId() ownerId: string,
    @Param("month", new ZodValidationPipe(monthSchema)) month: string,
  ) {
    return this.meals.history(ownerId, month);
  }

  @Get("days/:date")
  day(@OwnerId() ownerId: string, @Param("date", new ZodValidationPipe(dateSchema)) date: string) {
    return this.meals.day(ownerId, date);
  }
}

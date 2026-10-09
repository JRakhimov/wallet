import { Controller, Get, Header, Param, Query, StreamableFile } from "@nestjs/common";
import { z } from "zod";
import { OwnerId } from "../../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { uuid } from "../../common/validation/schemas";
import { PhotoSize, PhotosService } from "./photos.service";

const sizeSchema = z.enum(["full", "thumb"]).default("full");

@Controller("nutrition/photos")
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Get(":id")
  @Header("Content-Type", "image/jpeg")
  // Photos never change once stored, so the browser may keep them; "private" keeps them out
  // of shared caches. Overrides the API-wide no-store header.
  @Header("Cache-Control", "private, max-age=31536000, immutable")
  async get(
    @OwnerId() ownerId: string,
    @Param("id", new ZodValidationPipe(uuid)) id: string,
    @Query("size", new ZodValidationPipe(sizeSchema)) size: PhotoSize,
  ) {
    return new StreamableFile(await this.photos.read(ownerId, id, size));
  }
}

import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { PrismaService } from "../../prisma/prisma.service";
import { PHOTO_STORAGE, PhotoStorage } from "./photo-storage";

// The client resizes photos before upload (≤1568 px JPEG, thumbnail ≤400 px).
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export const MAX_THUMB_BYTES = 1024 * 1024;

export type PhotoSize = "full" | "thumb";

const isJpeg = (data: Buffer) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;

@Injectable()
export class PhotosService {
  constructor(
    private readonly db: PrismaService,
    @Inject(PHOTO_STORAGE) private readonly storage: PhotoStorage,
  ) {}

  /** Validates and stores a photo with its thumbnail; returns the MealPhoto row. */
  async save(ownerId: string, photo: Buffer, thumbnail: Buffer) {
    if (!isJpeg(photo) || !isJpeg(thumbnail)) {
      throw new BadRequestException("Фото должно быть в формате JPEG");
    }
    if (photo.length > MAX_PHOTO_BYTES || thumbnail.length > MAX_THUMB_BYTES) {
      throw new BadRequestException("Фото слишком большое");
    }

    const id = randomUUID();
    const folder = `nutrition/${ownerId}/${DateTime.utc().toFormat("yyyy/MM")}`;
    const storageKey = `${folder}/${id}.jpg`;
    const thumbKey = `${folder}/${id}.thumb.jpg`;
    await this.storage.put(storageKey, photo);
    await this.storage.put(thumbKey, thumbnail);
    return this.db.mealPhoto.create({ data: { id, ownerId, storageKey, thumbKey } });
  }

  async read(ownerId: string, id: string, size: PhotoSize) {
    const photo = await this.db.mealPhoto.findFirst({ where: { id, ownerId } });
    if (!photo) {
      throw new NotFoundException("Фото не найдено");
    }
    return this.storage.get(size === "thumb" ? photo.thumbKey : photo.storageKey);
  }

  /** Removes the files and the row; used when an abandoned draft is cleaned up. */
  async remove(id: string) {
    const photo = await this.db.mealPhoto.findUnique({ where: { id } });
    if (!photo) {
      return;
    }
    await this.storage.delete(photo.storageKey);
    await this.storage.delete(photo.thumbKey);
    await this.db.mealPhoto.delete({ where: { id } });
  }
}

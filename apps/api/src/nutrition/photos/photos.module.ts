import { Module } from "@nestjs/common";
import { AppConfig, CONFIG } from "../../config/app-config";
import { LocalPhotoStorage } from "./local-photo-storage";
import { PHOTO_STORAGE } from "./photo-storage";
import { PhotosController } from "./photos.controller";
import { PhotosService } from "./photos.service";

@Module({
  controllers: [PhotosController],
  providers: [
    PhotosService,
    {
      provide: PHOTO_STORAGE,
      useFactory: (config: AppConfig) => new LocalPhotoStorage(config.nutrition.photoDir),
      inject: [CONFIG],
    },
  ],
  exports: [PhotosService],
})
export class PhotosModule {}

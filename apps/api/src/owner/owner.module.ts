import { Module } from "@nestjs/common";
import { OwnerSetupRegistry } from "./owner-setup.registry";
import { OwnerController } from "./owner.controller";
import { OwnerService } from "./owner.service";

@Module({
  controllers: [OwnerController],
  providers: [OwnerService, OwnerSetupRegistry],
  exports: [OwnerService, OwnerSetupRegistry],
})
export class OwnerModule {}

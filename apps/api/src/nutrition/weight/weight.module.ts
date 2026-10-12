import { Module } from "@nestjs/common";
import { OwnerModule } from "../../owner/owner.module";
import { WeightController } from "./weight.controller";
import { WeightService } from "./weight.service";

@Module({
  imports: [OwnerModule],
  controllers: [WeightController],
  providers: [WeightService],
  exports: [WeightService],
})
export class WeightModule {}

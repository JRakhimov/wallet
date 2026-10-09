import { Module } from "@nestjs/common";
import { OperationsModule } from "../operations/operations.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [OperationsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

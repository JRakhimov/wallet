import { Controller, Get, Header, Query } from "@nestjs/common";
import { OwnerId } from "../../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { month } from "../../common/validation/schemas";
import { ReportsService } from "./reports.service";

const optionalMonthPipe = new ZodValidationPipe(month.optional());

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("reports/summary")
  summary(@OwnerId() ownerId: string, @Query("month", optionalMonthPipe) month?: string) {
    return this.reports.summary(ownerId, month);
  }

  @Get("reports/insights")
  insights(@OwnerId() ownerId: string, @Query("month", optionalMonthPipe) month?: string) {
    return this.reports.insights(ownerId, month);
  }

  @Get("exports/transactions.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="wallet.csv"')
  exportCsv(@OwnerId() ownerId: string, @Query("month", optionalMonthPipe) month?: string) {
    return this.reports.exportCsv(ownerId, month);
  }
}

import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { rateLimit } from "../../common/middleware/rate-limit.middleware";
import { OwnerModule } from "../../owner/owner.module";
import { AnalysisModule } from "../analysis/analysis.module";
import { PhotosModule } from "../photos/photos.module";
import { WorkoutsModule } from "../workouts/workouts.module";
import { MealsController } from "./meals.controller";
import { MealsService } from "./meals.service";

// Each recognition costs an LLM call: allow a burst of corrections, not a flood.
const ANALYSIS_REQUESTS_PER_MINUTE = 10;

@Module({
  imports: [OwnerModule, PhotosModule, AnalysisModule, WorkoutsModule],
  controllers: [MealsController],
  providers: [MealsService],
})
export class MealsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(rateLimit({ maxRequests: ANALYSIS_REQUESTS_PER_MINUTE }))
      .forRoutes(
        { path: "nutrition/meals/analyze", method: RequestMethod.POST },
        { path: "nutrition/meals/:id/reanalyze", method: RequestMethod.POST },
        { path: "nutrition/meals/:id/retry", method: RequestMethod.POST },
      );
  }
}

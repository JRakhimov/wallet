import { Module } from "@nestjs/common";
import { MealsModule } from "./meals/meals.module";
import { ProfileModule } from "./profile/profile.module";
import { WorkoutsModule } from "./workouts/workouts.module";

/** Nutrition mini app: body profile, daily targets, the meal diary and workouts. */
@Module({
  imports: [ProfileModule, MealsModule, WorkoutsModule],
})
export class NutritionModule {}

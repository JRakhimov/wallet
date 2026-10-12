import { Module } from "@nestjs/common";
import { MealsModule } from "./meals/meals.module";
import { ProfileModule } from "./profile/profile.module";
import { WeightModule } from "./weight/weight.module";
import { WorkoutsModule } from "./workouts/workouts.module";

/** Nutrition mini app: body profile, daily targets, the meal diary, workouts and weight. */
@Module({
  imports: [ProfileModule, MealsModule, WorkoutsModule, WeightModule],
})
export class NutritionModule {}

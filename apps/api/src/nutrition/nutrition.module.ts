import { Module } from "@nestjs/common";
import { MealsModule } from "./meals/meals.module";
import { ProfileModule } from "./profile/profile.module";

/** Nutrition mini app: body profile, daily targets and the meal diary. */
@Module({
  imports: [ProfileModule, MealsModule],
})
export class NutritionModule {}

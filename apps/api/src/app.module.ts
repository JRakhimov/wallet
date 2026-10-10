import { DynamicModule, Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { AppConfig } from "./config/app-config";
import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { NutritionModule } from "./nutrition/nutrition.module";
import { OwnerModule } from "./owner/owner.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TasksModule } from "./tasks/tasks.module";
import { TelegramModule } from "./telegram/telegram.module";
import { WalletModule } from "./wallet/wallet.module";

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        PrismaModule,
        AuthModule,
        HealthModule,
        OwnerModule,
        TelegramModule,
        WalletModule,
        NutritionModule,
        TasksModule,
      ],
    };
  }
}

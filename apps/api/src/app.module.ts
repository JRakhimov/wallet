import { DynamicModule, Module } from "@nestjs/common";
import { AccountsModule } from "./accounts/accounts.module";
import { AuthModule } from "./auth/auth.module";
import { BudgetsModule } from "./budgets/budgets.module";
import { CategoriesModule } from "./categories/categories.module";
import { AppConfig } from "./config/app-config";
import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { OperationsModule } from "./operations/operations.module";
import { OwnerModule } from "./owner/owner.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ReportsModule } from "./reports/reports.module";
import { TelegramModule } from "./telegram/telegram.module";

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
        AccountsModule,
        CategoriesModule,
        OperationsModule,
        BudgetsModule,
        ReportsModule,
        TelegramModule,
      ],
    };
  }
}

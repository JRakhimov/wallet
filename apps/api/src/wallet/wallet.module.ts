import { Module, OnModuleInit } from "@nestjs/common";
import { OwnerModule } from "../owner/owner.module";
import { OwnerSetupRegistry } from "../owner/owner-setup.registry";
import { AccountsModule } from "./accounts/accounts.module";
import { BudgetsModule } from "./budgets/budgets.module";
import { CategoriesModule } from "./categories/categories.module";
import { OperationsModule } from "./operations/operations.module";
import { ReportsModule } from "./reports/reports.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { defaultAccount, defaultCategories } from "./wallet-defaults";

/** Wallet mini app: accounts, categories, operations, budgets, subscriptions and reports. */
@Module({
  imports: [
    OwnerModule,
    AccountsModule,
    CategoriesModule,
    OperationsModule,
    BudgetsModule,
    ReportsModule,
    SubscriptionsModule,
  ],
})
export class WalletModule implements OnModuleInit {
  constructor(private readonly ownerSetups: OwnerSetupRegistry) {}

  onModuleInit() {
    this.ownerSetups.register(async (tx, ownerId) => {
      await tx.account.create({ data: { ownerId, ...defaultAccount } });
      await tx.category.createMany({
        data: defaultCategories.map((category) => ({ ownerId, ...category })),
      });
    });
  }
}

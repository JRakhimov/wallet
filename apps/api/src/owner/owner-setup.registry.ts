import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

/** Creates an app's starter data for a brand-new owner, inside the owner-creation transaction. */
export type OwnerSetup = (tx: Prisma.TransactionClient, ownerId: string) => Promise<void>;

/**
 * Each mini app registers its starter data here (e.g. in its module's `onModuleInit`),
 * so the shared owner module stays independent of the apps.
 */
@Injectable()
export class OwnerSetupRegistry {
  private readonly setups: OwnerSetup[] = [];

  register(setup: OwnerSetup) {
    this.setups.push(setup);
  }

  async runAll(tx: Prisma.TransactionClient, ownerId: string) {
    for (const setup of this.setups) {
      await setup(tx, ownerId);
    }
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { Subscription } from "@prisma/client";
import { DateTime } from "luxon";
import { OwnerService } from "../../owner/owner.service";
import { PrismaService } from "../../prisma/prisma.service";
import { nextChargeDate } from "./charge-date";
import { CreateSubscriptionDto, UpdateSubscriptionDto } from "./dto/subscription.dto";

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly db: PrismaService,
    private readonly owners: OwnerService,
  ) {}

  /** The owner's subscriptions, the ones charged soonest first. */
  async list(ownerId: string) {
    const timezone = await this.owners.getTimezone(ownerId);
    const today = DateTime.now().setZone(timezone);
    const subscriptions = await this.db.subscription.findMany({ where: { ownerId } });

    return subscriptions
      .map((subscription) => this.view(subscription, today))
      .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name, "ru"));
  }

  async create(ownerId: string, input: CreateSubscriptionDto) {
    const subscription = await this.db.subscription.create({ data: { ownerId, ...input } });

    return this.viewForOwner(ownerId, subscription);
  }

  async update(ownerId: string, id: string, input: UpdateSubscriptionDto) {
    await this.find(ownerId, id);
    const subscription = await this.db.subscription.update({ where: { id }, data: input });

    return this.viewForOwner(ownerId, subscription);
  }

  async remove(ownerId: string, id: string) {
    await this.find(ownerId, id);
    await this.db.subscription.delete({ where: { id } });

    return { ok: true };
  }

  private async find(ownerId: string, id: string) {
    const subscription = await this.db.subscription.findFirst({ where: { id, ownerId } });
    if (!subscription) {
      throw new NotFoundException("Подписка не найдена");
    }

    return subscription;
  }

  private async viewForOwner(ownerId: string, subscription: Subscription) {
    const timezone = await this.owners.getTimezone(ownerId);

    return this.view(subscription, DateTime.now().setZone(timezone));
  }

  private view(subscription: Subscription, today: DateTime) {
    const next = nextChargeDate(subscription.chargeDay, today);

    return {
      id: subscription.id,
      name: subscription.name,
      amount: subscription.amount.toFixed(2),
      chargeDay: subscription.chargeDay,
      nextChargeDate: next.toISODate()!,
      daysLeft: Math.round(next.diff(today.startOf("day"), "days").days),
    };
  }
}

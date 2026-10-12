import { HttpException, Injectable, Logger } from "@nestjs/common";
import { PendingAction, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { PrismaService } from "../prisma/prisma.service";
import { HistoryService } from "./history.service";
import { AssistantToolbox } from "./tools/toolbox";
import { Offer } from "./tools/tool";

/** A button older than this does nothing: the data may have changed since. */
const ACTION_TTL_HOURS = 24;
/** Handled and expired buttons are kept a while for debugging, then removed. */
const KEEP_DAYS = 7;

const GONE_TEXT = "Это действие уже недоступно";
const EXPIRED_TEXT = "Время вышло. Попросите ещё раз";
const DONE_TEXT = "Уже сделано";
const CANCELLED_TEXT = "Уже отменено";
const CANCEL_TEXT = "✖️ Отменено";

export type SavedOffer = Offer & { id: string };

/**
 * Changes waiting for a tap: «Подтвердить» before an edit or a deletion, «Отменить» under a
 * record that was just made. Each one runs at most once.
 */
@Injectable()
export class ActionsService {
  private readonly logger = new Logger(ActionsService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly toolbox: AssistantToolbox,
    private readonly history: HistoryService,
  ) {}

  async save(ownerId: string, offers: Offer[]): Promise<SavedOffer[]> {
    const expiresAt = DateTime.now().plus({ hours: ACTION_TTL_HOURS }).toJSDate();
    const saved: SavedOffer[] = [];

    for (const offer of offers) {
      const row = await this.db.pendingAction.create({
        data: {
          ownerId,
          kind: offer.action,
          payload: offer.payload as Prisma.InputJsonValue,
          summary: offer.summary,
          expiresAt,
        },
      });

      saved.push({ ...offer, id: row.id });
    }

    void this.removeOld(ownerId);

    return saved;
  }

  /** A tap: `approve` runs the action, otherwise it is dropped. Returns the outcome for the chat. */
  async resolve(telegramId: bigint, id: string, approve: boolean) {
    const action = await this.db.pendingAction.findFirst({ where: { id, owner: { telegramId } } });
    if (!action) {
      return GONE_TEXT;
    }

    if (action.status !== "pending") {
      return action.status === "cancelled" ? CANCELLED_TEXT : DONE_TEXT;
    }

    if (action.expiresAt < new Date()) {
      await this.setStatus(id, "cancelled");
      return EXPIRED_TEXT;
    }

    // Two quick taps: only the first one gets the action.
    const claimed = await this.db.pendingAction.updateMany({
      where: { id, status: "pending" },
      data: { status: approve ? "done" : "cancelled" },
    });
    if (claimed.count === 0) {
      return DONE_TEXT;
    }

    if (!approve) {
      await this.history.addNote(action.ownerId, `Пользователь нажал «Отмена»: ${action.summary}`);
      return CANCEL_TEXT;
    }

    return this.run(action);
  }

  private async run(action: PendingAction) {
    const handler = this.toolbox.tools.actions.get(action.kind);
    if (!handler) {
      await this.setStatus(action.id, "failed");
      return GONE_TEXT;
    }

    let outcome: string;
    try {
      outcome = await handler(action.ownerId, action.payload as Record<string, unknown>);
    } catch (error) {
      if (!(error instanceof HttpException)) {
        // Something broke on our side: the same tap may work a bit later.
        await this.setStatus(action.id, "pending");
        throw error;
      }

      await this.setStatus(action.id, "failed");
      outcome = `Не получилось: ${error.message}`;
    }

    await this.history.addNote(
      action.ownerId,
      `Пользователь нажал кнопку: ${action.summary} → ${outcome}`,
    );

    return outcome;
  }

  /** Best effort: a failure here must not break the answer. */
  private async removeOld(ownerId: string) {
    try {
      await this.db.pendingAction.deleteMany({
        where: { ownerId, createdAt: { lt: DateTime.now().minus({ days: KEEP_DAYS }).toJSDate() } },
      });
    } catch {
      this.logger.warn("Could not remove old pending actions");
    }
  }

  private async setStatus(id: string, status: string) {
    await this.db.pendingAction.update({ where: { id }, data: { status } });
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { PrismaService } from "../prisma/prisma.service";
import { TurnItem } from "./assistant-model";

/** The model sees the last turns of the last hours: enough for "а вчера?" and "удали его". */
const HISTORY_TURNS = 10;
const HISTORY_HOURS = 3;
/** Older turns are of no use to the model; they are removed. */
const KEEP_DAYS = 30;
/** A long tool result is cut in the history: the model rarely needs it again in full. */
const MAX_STORED_OUTPUT = 3000;

/** Turns of the chat with the assistant: what the user said, the tool calls and the answers. */
@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(private readonly db: PrismaService) {}

  /** Recent turns, oldest first; nothing before `since` (the last /new). */
  async recent(ownerId: string, since: Date | null) {
    const window = DateTime.now().minus({ hours: HISTORY_HOURS }).toJSDate();
    const from = since && since > window ? since : window;

    const rows = await this.db.assistantMessage.findMany({
      where: { ownerId, createdAt: { gte: from } },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
    });

    return rows.reverse().flatMap((row) => row.items as TurnItem[]);
  }

  async save(ownerId: string, items: TurnItem[]) {
    await this.db.assistantMessage.create({
      data: { ownerId, items: items.map(forStorage) as Prisma.InputJsonValue },
    });

    void this.removeOld(ownerId);
  }

  /** Something the model should know next time, e.g. that the user tapped «Подтвердить». */
  async addNote(ownerId: string, text: string) {
    await this.save(ownerId, [{ type: "note", text }]);
  }

  /** Turns since a moment: the daily limit counts them. */
  countSince(ownerId: string, since: Date) {
    return this.db.assistantMessage.count({ where: { ownerId, createdAt: { gte: since } } });
  }

  /** Best effort: a failure here must not break the answer. */
  private async removeOld(ownerId: string) {
    try {
      await this.db.assistantMessage.deleteMany({
        where: {
          ownerId,
          createdAt: { lt: DateTime.now().minus({ days: KEEP_DAYS }).toJSDate() },
        },
      });
    } catch {
      this.logger.warn("Could not remove old assistant messages");
    }
  }
}

/** Photos are not kept, long tool results are cut. */
function forStorage(item: TurnItem): TurnItem {
  if (item.type === "user") {
    return { type: "user", text: item.text };
  }

  if (item.type === "result" && item.output.length > MAX_STORED_OUTPUT) {
    return { ...item, output: `${item.output.slice(0, MAX_STORED_OUTPUT)}… (обрезано)` };
  }

  return item;
}

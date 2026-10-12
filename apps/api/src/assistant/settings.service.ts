import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type AssistantSettingsView = {
  /** HH:mm in the owner's timezone; null when the morning brief is off. */
  morningBriefAt: string | null;
  weeklyReport: boolean;
  /** The chat history starts here (after /new). */
  historyFrom: Date | null;
};

export const DEFAULT_SETTINGS: AssistantSettingsView = {
  morningBriefAt: "08:00",
  weeklyReport: true,
  historyFrom: null,
};

/** The assistant's settings; an owner without a row gets the defaults. */
@Injectable()
export class AssistantSettingsService {
  constructor(private readonly db: PrismaService) {}

  async get(ownerId: string): Promise<AssistantSettingsView> {
    const row = await this.db.assistantSettings.findUnique({ where: { ownerId } });

    return row ?? DEFAULT_SETTINGS;
  }

  async update(ownerId: string, changes: Partial<AssistantSettingsView>) {
    const row = await this.db.assistantSettings.upsert({
      where: { ownerId },
      create: { ...DEFAULT_SETTINGS, ...changes, ownerId },
      update: changes,
    });

    return row;
  }

  /** /new: the assistant forgets the conversation so far, but not the facts in its memory. */
  async restartChat(ownerId: string) {
    await this.update(ownerId, { historyFrom: new Date() });
  }
}

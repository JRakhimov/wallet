import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type AssistantSettingsView = {
  /** HH:mm in the owner's timezone; null when the morning brief is off. */
  morningBriefAt: string | null;
  weeklyReport: boolean;
  /** HH:mm in the owner's timezone; null when the evening brief is off. */
  eveningBriefAt: string | null;
  /** The chat history starts here (after /new). */
  historyFrom: Date | null;
  /** The weather in the briefs: today's in the morning one, tomorrow's in the evening one. */
  briefWeather: boolean;
  /** The city of that weather; null for the city of the owner's timezone. */
  weatherPlace: string | null;
};

export const DEFAULT_SETTINGS: AssistantSettingsView = {
  morningBriefAt: "08:00",
  weeklyReport: true,
  eveningBriefAt: "21:00",
  historyFrom: null,
  briefWeather: true,
  weatherPlace: null,
};

/** The city of the briefs' weather: the chosen one, or the city of the timezone. */
export function weatherPlaceOf(settings: AssistantSettingsView, timezone: string) {
  // "Asia/Tashkent" → "Tashkent"; the geocoder knows cities by their English names too.
  return settings.weatherPlace ?? timezone.split("/").at(-1)!.replace(/_/g, " ");
}

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

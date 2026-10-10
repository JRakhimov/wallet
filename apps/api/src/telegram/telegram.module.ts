import { Module } from "@nestjs/common";
import { AccessModule } from "../access/access.module";
import { VoiceModule } from "../voice/voice.module";
import { ReminderService } from "./reminder.service";
import { TelegramBotService } from "./telegram-bot.service";

@Module({ imports: [AccessModule, VoiceModule], providers: [TelegramBotService, ReminderService] })
export class TelegramModule {}

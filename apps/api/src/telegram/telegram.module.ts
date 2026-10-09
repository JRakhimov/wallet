import { Module } from "@nestjs/common";
import { VoiceModule } from "../voice/voice.module";
import { ReminderService } from "./reminder.service";
import { TelegramBotService } from "./telegram-bot.service";

@Module({ imports: [VoiceModule], providers: [TelegramBotService, ReminderService] })
export class TelegramModule {}

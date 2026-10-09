import { Module } from "@nestjs/common";
import { VoiceModule } from "../voice/voice.module";
import { TelegramBotService } from "./telegram-bot.service";

@Module({ imports: [VoiceModule], providers: [TelegramBotService] })
export class TelegramModule {}

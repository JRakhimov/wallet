import { Logger, Module } from "@nestjs/common";
import { AppConfig, CONFIG } from "../config/app-config";
import { WorkoutsModule } from "../nutrition/workouts/workouts.module";
import { OwnerModule } from "../owner/owner.module";
import { TasksModule } from "../tasks/tasks.module";
import { AccountsModule } from "../wallet/accounts/accounts.module";
import { CategoriesModule } from "../wallet/categories/categories.module";
import { OperationsModule } from "../wallet/operations/operations.module";
import { OpenAiSpeechToText, SPEECH_TO_TEXT } from "./speech-to-text";
import { OpenAiTransactionParser, TRANSACTION_PARSER } from "./transaction-parser";
import { VoiceTransactionService } from "./voice-transaction.service";

function voiceConfig(config: AppConfig) {
  if (!config.voice) {
    Logger.warn("Voice commands are disabled: OPENAI_API_KEY is not set", "VoiceModule");
  }
  return config.voice;
}

/**
 * Voice messages to the bot: speech recognition and the language model are replaceable
 * behind SPEECH_TO_TEXT and TRANSACTION_PARSER.
 */
@Module({
  imports: [
    OwnerModule,
    AccountsModule,
    CategoriesModule,
    OperationsModule,
    WorkoutsModule,
    TasksModule,
  ],
  providers: [
    {
      provide: SPEECH_TO_TEXT,
      useFactory: (config: AppConfig) => {
        const voice = voiceConfig(config);
        return voice ? new OpenAiSpeechToText(voice) : null;
      },
      inject: [CONFIG],
    },
    {
      provide: TRANSACTION_PARSER,
      useFactory: (config: AppConfig) =>
        config.voice ? new OpenAiTransactionParser(config.voice) : null,
      inject: [CONFIG],
    },
    VoiceTransactionService,
  ],
  exports: [VoiceTransactionService],
})
export class VoiceModule {}

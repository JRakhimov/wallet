import { Logger, Module } from "@nestjs/common";
import { AppConfig, CONFIG } from "../config/app-config";
import { OpenAiSpeechToText, SPEECH_TO_TEXT } from "./speech-to-text";

function createSpeechToText(config: AppConfig) {
  if (!config.voice) {
    Logger.warn("Voice messages are disabled: OPENAI_API_KEY is not set", "VoiceModule");
    return null;
  }

  return new OpenAiSpeechToText(config.voice);
}

/** Speech recognition for voice messages, replaceable behind SPEECH_TO_TEXT. */
@Module({
  providers: [{ provide: SPEECH_TO_TEXT, useFactory: createSpeechToText, inject: [CONFIG] }],
  exports: [SPEECH_TO_TEXT],
})
export class VoiceModule {}

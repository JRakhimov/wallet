import OpenAI, { toFile } from "openai";
import { VoiceConfig } from "../config/app-config";

/** Turns a recorded voice message into text. */
export interface SpeechToText {
  transcribe(audio: Buffer, filename: string): Promise<string>;
}

/** DI token for the SpeechToText implementation. */
export const SPEECH_TO_TEXT = Symbol("SPEECH_TO_TEXT");

const TIMEOUT_MS = 60_000;

/**
 * Whisper through the OpenAI API. Any OpenAI-compatible server works too (a local
 * faster-whisper / whisper.cpp server): set WHISPER_BASE_URL and WHISPER_MODEL.
 */
export class OpenAiSpeechToText implements SpeechToText {
  private readonly client: OpenAI;

  constructor(private readonly config: VoiceConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.transcriptionBaseUrl,
      timeout: TIMEOUT_MS,
      maxRetries: 1,
    });
  }

  async transcribe(audio: Buffer, filename: string) {
    const file = await toFile(audio, filename);
    const result = await this.client.audio.transcriptions.create({
      file,
      model: this.config.transcriptionModel,
    });
    return result.text.trim();
  }
}

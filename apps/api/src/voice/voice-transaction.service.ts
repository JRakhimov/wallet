import { Inject, Injectable } from "@nestjs/common";
import { OwnerService } from "../owner/owner.service";
import { AccountsService } from "../wallet/accounts/accounts.service";
import { CategoriesService } from "../wallet/categories/categories.service";
import { OperationsService } from "../wallet/operations/operations.service";
import { SPEECH_TO_TEXT, SpeechToText } from "./speech-to-text";
import { CategoryChoice, TRANSACTION_PARSER, TransactionParser } from "./transaction-parser";

/** A failure whose message can be sent to the owner in the chat as is. */
export class VoiceError extends Error {}

export type VoiceRecording = {
  telegramId: bigint;
  audio: Buffer;
  filename: string;
  /** Makes the record idempotent: the same message never creates two operations. */
  key: string;
  /** Called when the work moves on, so the chat can show progress. */
  onStage?: (stage: "parsing") => Promise<void>;
};

const MAX_AMOUNT = 999_999_999_999;
const EXAMPLE = "Запиши расход 45000 сум за обед";

const KIND_LABELS = { expense: "Расход", income: "Доход" };
const CURRENCY_LABELS: Record<string, string> = { UZS: "сум" };

/**
 * Voice message → text → kind, amount and category → operation in the wallet.
 * Returns the confirmation to send back to the chat.
 */
@Injectable()
export class VoiceTransactionService {
  constructor(
    @Inject(SPEECH_TO_TEXT) private readonly speech: SpeechToText | null,
    @Inject(TRANSACTION_PARSER) private readonly parser: TransactionParser | null,
    private readonly owners: OwnerService,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
    private readonly operations: OperationsService,
  ) {}

  get enabled() {
    return Boolean(this.speech && this.parser);
  }

  async record(input: VoiceRecording) {
    if (!this.speech || !this.parser) {
      throw new VoiceError("Голосовые команды не настроены на сервере");
    }

    const text = await this.speech.transcribe(input.audio, input.filename);
    if (!text) {
      throw new VoiceError("Не удалось разобрать речь. Попробуйте записать ещё раз");
    }

    await input.onStage?.("parsing");
    const owner = await this.owners.ensureOwner(input.telegramId);
    const [accounts, categories] = await Promise.all([
      this.accounts.list(owner.id),
      this.categories.list(owner.id),
    ]);
    const account = accounts.find((item) => !item.archived);
    if (!account) {
      throw new VoiceError("В кошельке нет активного счёта");
    }
    const choices = categories
      .filter((category) => !category.archived)
      .map(({ id, name, kind }) => ({ id, name, kind }) as CategoryChoice);

    const parsed = await this.parser.parse(text, choices);
    const amount = Math.round(parsed.amount * 100) / 100;
    if (!parsed.isTransaction || !(amount > 0) || amount > MAX_AMOUNT) {
      throw new VoiceError(`Не понял: «${text}». Скажите, например: «${EXAMPLE}»`);
    }

    const category = choices.find(
      (item) => item.id === parsed.categoryId && item.kind === parsed.kind,
    );
    if (!category) {
      throw new VoiceError(`Не нашёл подходящую категорию для «${text}». Добавьте её в кошельке`);
    }

    const note = parsed.note.trim().slice(0, 100);
    await this.operations.create(
      owner.id,
      {
        kind: parsed.kind,
        amount: amount.toFixed(2),
        accountId: account.id,
        categoryId: category.id,
        note,
        occurredAt: new Date().toISOString(),
      },
      input.key,
    );

    const money = `${formatAmount(amount)} ${CURRENCY_LABELS[account.currency] ?? account.currency}`;
    const purpose = note ? ` за ${note}` : "";
    return `${KIND_LABELS[parsed.kind]} ${money}${purpose} записан · ${category.name}`;
  }
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount);
}

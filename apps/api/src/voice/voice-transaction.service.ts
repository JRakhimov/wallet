import { Inject, Injectable } from "@nestjs/common";
import { MAX_WORKOUT_KCAL } from "../nutrition/workouts/dto/workout.dto";
import { WorkoutsService } from "../nutrition/workouts/workouts.service";
import { OwnerService } from "../owner/owner.service";
import { AccountsService } from "../wallet/accounts/accounts.service";
import { CategoriesService } from "../wallet/categories/categories.service";
import { OperationsService } from "../wallet/operations/operations.service";
import { SPEECH_TO_TEXT, SpeechToText } from "./speech-to-text";
import {
  CategoryChoice,
  ParsedTransaction,
  TRANSACTION_PARSER,
  TransactionParser,
} from "./transaction-parser";

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
const WORKOUT_EXAMPLE = "Запиши тренировку, сожжено 420 калорий";
const MAX_WORKOUT_MINUTES = 24 * 60;

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
    private readonly workouts: WorkoutsService,
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
    const choices = await this.categoryChoices(owner.id);
    const parsed = await this.parser.parse(text, choices);

    const amount = Math.round(parsed.amount * 100) / 100;
    if (!parsed.isTransaction || !(amount > 0) || amount > MAX_AMOUNT) {
      throw new VoiceError(`Не понял: «${text}». Скажите, например: «${EXAMPLE}»`);
    }
    const note = parsed.note.trim().slice(0, 100);

    if (parsed.kind === "workout") {
      return this.recordWorkout(
        owner.id,
        { kcal: amount, minutes: parsed.durationMinutes, note },
        input.key,
      );
    }
    return this.recordMoney(
      owner.id,
      { kind: parsed.kind, amount, note, text, parsed, choices },
      input.key,
    );
  }

  private async categoryChoices(ownerId: string) {
    const categories = await this.categories.list(ownerId);
    return categories
      .filter((category) => !category.archived)
      .map(({ id, name, kind }) => ({ id, name, kind }) as CategoryChoice);
  }

  /** Active calories from the watch or the owner's estimate; they do not change the targets. */
  private async recordWorkout(
    ownerId: string,
    workout: { kcal: number; minutes: number | null; note: string },
    key: string,
  ) {
    const kcal = Math.round(workout.kcal);
    if (kcal < 1 || kcal > MAX_WORKOUT_KCAL) {
      throw new VoiceError(
        `Не понял количество калорий: «${kcal}». Скажите, например: «${WORKOUT_EXAMPLE}»`,
      );
    }
    const minutes = workout.minutes ? Math.round(workout.minutes) : null;
    await this.workouts.create(
      ownerId,
      {
        performedAt: new Date().toISOString(),
        kcal,
        durationMin: minutes && minutes >= 1 && minutes <= MAX_WORKOUT_MINUTES ? minutes : null,
        note: workout.note,
      },
      key,
    );
    const kind = workout.note ? `Тренировка (${workout.note})` : "Тренировка";
    const duration = minutes ? ` · ${minutes} мин` : "";
    return `${kind}: ${formatAmount(kcal)} ккал${duration} записана`;
  }

  private async recordMoney(
    ownerId: string,
    money: {
      kind: "expense" | "income";
      amount: number;
      note: string;
      text: string;
      parsed: ParsedTransaction;
      choices: CategoryChoice[];
    },
    key: string,
  ) {
    const accounts = await this.accounts.list(ownerId);
    const account = accounts.find((item) => !item.archived);
    if (!account) {
      throw new VoiceError("В кошельке нет активного счёта");
    }
    const category = money.choices.find(
      (item) => item.id === money.parsed.categoryId && item.kind === money.kind,
    );
    if (!category) {
      throw new VoiceError(
        `Не нашёл подходящую категорию для «${money.text}». Добавьте её в кошельке`,
      );
    }

    await this.operations.create(
      ownerId,
      {
        kind: money.kind,
        amount: money.amount.toFixed(2),
        accountId: account.id,
        categoryId: category.id,
        note: money.note,
        occurredAt: new Date().toISOString(),
      },
      key,
    );

    const total = `${formatAmount(money.amount)} ${CURRENCY_LABELS[account.currency] ?? account.currency}`;
    const purpose = money.note ? ` за ${money.note}` : "";
    return `${KIND_LABELS[money.kind]} ${total}${purpose} записан · ${category.name}`;
  }
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount);
}

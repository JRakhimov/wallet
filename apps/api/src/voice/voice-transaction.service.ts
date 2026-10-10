import { Inject, Injectable } from "@nestjs/common";
import { DateTime } from "luxon";
import { MAX_WORKOUT_KCAL } from "../nutrition/workouts/dto/workout.dto";
import { WorkoutsService } from "../nutrition/workouts/workouts.service";
import { OwnerService } from "../owner/owner.service";
import { createTaskSchema } from "../tasks/dto/task.dto";
import { dueLabel, repeatLabel } from "../tasks/labels";
import { remindAtFor } from "../tasks/recurrence";
import { TasksService, TaskView } from "../tasks/tasks.service";
import { AccountsService } from "../wallet/accounts/accounts.service";
import { CategoriesService } from "../wallet/categories/categories.service";
import { BASE_CURRENCY } from "../wallet/currency";
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
const TASK_EXAMPLE = "Напомни завтра в 10 позвонить в банк";
const ALL_DAY_TIME = "09:00";
const MAX_WORKOUT_MINUTES = 24 * 60;

const KIND_LABELS = { expense: "Расход", income: "Доход" };
const CURRENCY_LABELS: Record<string, string> = { UZS: "сум" };

/**
 * Voice message → text → kind, amount and category → operation in the wallet, a workout or
 * a task. Returns the confirmation to send back to the chat.
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
    private readonly tasks: TasksService,
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
    const now = DateTime.now().setZone(owner.timezone);
    const parsed = await this.parser.parse(text, choices, {
      now: `${now.toFormat("yyyy-MM-dd cccc HH:mm")} (${owner.timezone})`,
    });

    const kind = parsed.kind;
    if (!parsed.isTransaction) {
      throw new VoiceError(`Не понял: «${text}». Скажите, например: «${EXAMPLE}»`);
    }

    if (kind === "task") {
      return this.recordTask(owner.id, { parsed, text, now }, input.key);
    }

    const amount = Math.round(parsed.amount * 100) / 100;
    if (!(amount > 0) || amount > MAX_AMOUNT) {
      throw new VoiceError(`Не понял: «${text}». Скажите, например: «${EXAMPLE}»`);
    }

    const note = parsed.note.trim().slice(0, 100);

    if (kind === "workout") {
      return this.recordWorkout(
        owner.id,
        { kcal: amount, minutes: parsed.durationMinutes, note },
        input.key,
      );
    }

    return this.recordMoney(owner.id, { kind, amount, note, text, parsed, choices }, input.key);
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

  /** A reminder, a to-do or, without a date, a note. */
  private async recordTask(
    ownerId: string,
    voice: { parsed: ParsedTransaction; text: string; now: DateTime },
    key: string,
  ) {
    const { parsed, text, now } = voice;

    const input = createTaskSchema.safeParse({
      title: parsed.title.trim().slice(0, 200),
      dueDate: parsed.dueDate,
      dueTime: parsed.dueDate ? parsed.dueTime : null,
      repeat: parsed.repeat,
      repeatDays: parsed.repeatDays,
    });
    if (!input.success) {
      throw new VoiceError(`Не понял задачу: «${text}». Скажите, например: «${TASK_EXAMPLE}»`);
    }

    const { dueDate, dueTime, repeat } = input.data;
    const remindAt = remindAtFor({ dueDate, dueTime }, now.zoneName!);
    if (repeat === "none" && dueTime && remindAt && remindAt <= now.toJSDate()) {
      throw new VoiceError(
        `Это время уже прошло: ${dueLabel(dueDate!, dueTime, now)}. Скажите день и время ещё раз`,
      );
    }

    const task = await this.tasks.create(ownerId, input.data, key);

    return taskConfirmation(task, now);
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
    // Spoken amounts are in sums, so the record goes to the first active account in sums.
    const account = accounts.find((item) => !item.archived && item.currency === BASE_CURRENCY);
    if (!account) {
      throw new VoiceError("В кошельке нет активного счёта в сумах");
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

/** "Напомню завтра в 10:00: Позвонить в банк", "Заметка записана: …" and the like. */
function taskConfirmation(task: TaskView, now: DateTime) {
  if (!task.dueDate) {
    return `Заметка записана: ${task.title}`;
  }

  const time = task.dueTime ?? ALL_DAY_TIME;

  if (task.repeat !== "none") {
    const repeat = repeatLabel(task.repeat, task.repeatDays, task.dueDate);
    const first = dueLabel(task.dueDate, time, now);

    return `Буду напоминать ${repeat} в ${time}: ${task.title}. Первый раз: ${first}`;
  }

  const remindAt = remindAtFor({ dueDate: task.dueDate, dueTime: task.dueTime }, now.zoneName!);
  if (remindAt && remindAt <= now.toJSDate()) {
    return `Записал на ${dueLabel(task.dueDate, null, now)}: ${task.title}`;
  }

  return `Напомню ${dueLabel(task.dueDate, time, now)}: ${task.title}`;
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount);
}

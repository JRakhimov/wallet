/** Telegram animates draft updates; more often than this only burns the rate limit. */
const UPDATE_INTERVAL_MS = 800;
/** A progress line stays at least this long, so it can be read before the next one. */
const STATUS_HOLD_MS = 1250;
/** A draft disappears after about 30 seconds without an update. */
const REFRESH_INTERVAL_MS = 20_000;
const MAX_DRAFT_LENGTH = 4096;

export type DraftTiming = { updateMs: number; holdMs: number; refreshMs: number };

const DEFAULT_TIMING: DraftTiming = {
  updateMs: UPDATE_INTERVAL_MS,
  holdMs: STATUS_HOLD_MS,
  refreshMs: REFRESH_INTERVAL_MS,
};

/**
 * "status" is a progress line ("Ищу операции…"), "answer" is the answer being written.
 * Telegram animates updates of one draft id and replaces a draft with another id at once.
 */
type Draft = { id: number; text: string; kind: "status" | "answer" };

/**
 * An answer being prepared, shown in the chat with sendMessageDraft. Each progress line gets a
 * new draft id, so it appears whole instead of being typed and cut off by the next one, and it
 * stays for `holdMs`; the answer keeps one id, so Telegram animates it as it grows. Frequent
 * updates are merged, the draft is refreshed until the answer is sent, failed updates are
 * dropped: only the latest text matters.
 */
export class DraftMessage {
  private wanted: Draft | null = null;
  private shown: Draft | null = null;
  private shownAt = 0;
  private lastSentAt = 0;
  private sending: Promise<void> = Promise.resolve();
  private timer?: NodeJS.Timeout;
  private refresh?: NodeJS.Timeout;
  private closed = false;

  constructor(
    private readonly sendDraft: (draftId: number, text: string) => Promise<void>,
    private readonly nextId: () => number,
    private readonly timing: DraftTiming = DEFAULT_TIMING,
  ) {}

  /** Shows a progress line; an empty one shows Telegram's "Thinking…" placeholder. */
  status(text: string) {
    if (this.closed || (this.wanted?.kind === "status" && this.wanted.text === text)) {
      return;
    }

    this.wanted = { id: this.nextId(), text, kind: "status" };
    this.schedule();
  }

  /** Shows the answer written so far. */
  write(text: string) {
    if (this.closed) {
      return;
    }

    const id = this.wanted?.kind === "answer" ? this.wanted.id : this.nextId();

    this.wanted = { id, text: text.slice(0, MAX_DRAFT_LENGTH), kind: "answer" };
    this.schedule();
  }

  /** Stops updating; the final message replaces the draft. */
  async close() {
    this.closed = true;

    clearTimeout(this.timer);
    clearInterval(this.refresh);

    await this.sending;
  }

  private schedule() {
    if (this.timer) {
      return;
    }

    const wait = this.waitTime();
    if (wait === 0) {
      void this.flush(false);
      return;
    }

    // Checked again on time: an update still in flight may have moved the hold.
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.schedule();
    }, wait);
    this.timer.unref();
  }

  /** How long until the next update may go out. */
  private waitTime() {
    const now = Date.now();
    const throttle = this.lastSentAt + this.timing.updateMs - now;
    const hold = this.shown?.kind === "status" ? this.shownAt + this.timing.holdMs - now : 0;

    return Math.max(0, throttle, hold);
  }

  private flush(force: boolean) {
    const draft = this.wanted;
    if (this.closed || !draft || (!force && isShown(draft, this.shown))) {
      return this.sending;
    }

    this.lastSentAt = Date.now();

    this.sending = this.sending.then(async () => {
      try {
        await this.sendDraft(draft.id, draft.text);
      } catch {
        // A lost update is replaced by the next one or by the final message.
        return;
      }

      if (this.shown?.id !== draft.id) {
        this.shownAt = Date.now();
      }

      this.shown = draft;
    });

    this.keepAlive();

    return this.sending;
  }

  private keepAlive() {
    if (this.refresh) {
      return;
    }

    this.refresh = setInterval(() => void this.flush(true), this.timing.refreshMs);
    this.refresh.unref();
  }
}

function isShown(draft: Draft, shown: Draft | null) {
  return shown !== null && shown.id === draft.id && shown.text === draft.text;
}

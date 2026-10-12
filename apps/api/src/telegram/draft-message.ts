/** Telegram animates draft updates; more often than this only burns the rate limit. */
const UPDATE_INTERVAL_MS = 700;
/** A draft disappears after about 30 seconds without an update. */
const REFRESH_INTERVAL_MS = 20_000;
const MAX_DRAFT_LENGTH = 4096;

export type DraftTiming = { updateMs: number; refreshMs: number };

const DEFAULT_TIMING: DraftTiming = {
  updateMs: UPDATE_INTERVAL_MS,
  refreshMs: REFRESH_INTERVAL_MS,
};

/**
 * An answer being written, shown in the chat with sendMessageDraft: frequent updates are
 * merged into one every `updateMs`, and the draft is refreshed so it lives until the answer is
 * sent. Only the latest text matters, so failed updates are dropped.
 */
export class DraftMessage {
  private text = "";
  /** The text Telegram shows now; null before the first update. */
  private shown: string | null = null;
  private lastSentAt = 0;
  private sending: Promise<void> = Promise.resolve();
  private timer?: NodeJS.Timeout;
  private refresh?: NodeJS.Timeout;
  private closed = false;

  constructor(
    private readonly sendDraft: (text: string) => Promise<void>,
    private readonly timing: DraftTiming = DEFAULT_TIMING,
  ) {}

  /** Shows a text; an empty one shows Telegram's "Thinking…" placeholder. */
  show(text: string) {
    if (this.closed) {
      return;
    }

    this.text = text.slice(0, MAX_DRAFT_LENGTH);
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

    const wait = Math.max(0, this.lastSentAt + this.timing.updateMs - Date.now());
    if (wait === 0) {
      void this.flush(false);
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush(false);
    }, wait);
    this.timer.unref();
  }

  private flush(force: boolean) {
    if (this.closed || (!force && this.text === this.shown)) {
      return this.sending;
    }

    const text = this.text;
    this.lastSentAt = Date.now();

    this.sending = this.sending.then(async () => {
      try {
        await this.sendDraft(text);
        this.shown = text;
      } catch {
        // A lost update is replaced by the next one or by the final message.
      }
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

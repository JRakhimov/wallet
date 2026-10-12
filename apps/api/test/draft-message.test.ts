import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { DraftMessage } from "../src/telegram/draft-message";

/** A draft with short timings that records what Telegram would get. */
function fixture(timing = { updateMs: 20, holdMs: 60, refreshMs: 1000 }) {
  const shown: { id: number; text: string }[] = [];
  let lastId = 0;

  const draft = new DraftMessage(
    async (id, text) => {
      shown.push({ id, text });
    },
    () => ++lastId,
    timing,
  );

  return { draft, shown };
}

test("each progress line is a new draft shown whole, and it stays long enough to read", async () => {
  const { draft, shown } = fixture();

  draft.status("Распознаём голос…");
  draft.status("Ищу операции…");
  draft.status("Считаю итоги месяца…");
  await delay(30);

  // Within the hold only the first line is on screen; the latest one replaces it after.
  assert.deepEqual(shown, [{ id: 1, text: "Распознаём голос…" }]);

  await delay(60);
  assert.deepEqual(shown.at(-1), { id: 3, text: "Считаю итоги месяца…" });
  assert.equal(shown.length, 2);

  await draft.close();
});

test("the answer keeps one draft id while it grows, so Telegram animates it", async () => {
  const { draft, shown } = fixture({ updateMs: 20, holdMs: 0, refreshMs: 1000 });

  draft.status("");
  await delay(25);
  draft.write("В октябре");
  await delay(25);
  draft.write("В октябре 3 800 000 сум");
  await delay(25);
  await draft.close();

  assert.deepEqual(shown, [
    { id: 1, text: "" },
    { id: 2, text: "В октябре" },
    { id: 2, text: "В октябре 3 800 000 сум" },
  ]);
});

test("a draft is kept alive until it is closed, and a failed update does not stop the rest", async () => {
  const shown: string[] = [];
  let fail = true;
  let lastId = 0;
  const draft = new DraftMessage(
    async (_id, text) => {
      if (fail) {
        fail = false;
        throw new Error("Too many requests");
      }

      shown.push(text);
    },
    () => ++lastId,
    { updateMs: 10, holdMs: 0, refreshMs: 40 },
  );

  draft.status("Ищу операции…");
  await delay(20);
  draft.status("Думаю…");
  await delay(100);

  // Telegram drops a draft after about 30 seconds without updates.
  assert.equal(shown[0], "Думаю…");
  assert.ok(shown.length >= 2);

  await draft.close();
  const count = shown.length;
  draft.write("после закрытия");
  await delay(60);

  assert.equal(shown.length, count);
});

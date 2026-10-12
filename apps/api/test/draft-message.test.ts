import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { DraftMessage } from "../src/telegram/draft-message";

test("a draft shows the first text at once, merges quick updates and is kept alive", async () => {
  const shown: string[] = [];
  const draft = new DraftMessage(
    async (text) => {
      shown.push(text);
    },
    { updateMs: 30, refreshMs: 80 },
  );

  draft.show("");
  draft.show("В октябре");
  draft.show("В октябре 3 800 000 сум");
  await delay(50);

  assert.deepEqual(shown, ["", "В октябре 3 800 000 сум"]);

  // Telegram drops a draft after about 30 seconds without updates.
  await delay(100);
  assert.equal(shown.at(-1), "В октябре 3 800 000 сум");
  assert.ok(shown.length >= 3);

  await draft.close();
  const count = shown.length;
  draft.show("после закрытия");
  await delay(120);

  assert.equal(shown.length, count);
});

test("a failed update does not stop the next ones", async () => {
  const shown: string[] = [];
  let fail = true;
  const draft = new DraftMessage(
    async (text) => {
      if (fail) {
        fail = false;
        throw new Error("Too many requests");
      }

      shown.push(text);
    },
    { updateMs: 10, refreshMs: 1000 },
  );

  draft.show("Ищу операции…");
  await delay(20);
  draft.show("Думаю");
  await delay(30);
  await draft.close();

  assert.deepEqual(shown, ["Думаю"]);
});

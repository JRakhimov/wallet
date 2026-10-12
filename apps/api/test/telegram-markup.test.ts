import assert from "node:assert/strict";
import { test } from "node:test";
import { toPlainText, toTelegramHtml } from "../src/telegram/telegram-markup";

test("bold, italics, code and links become Telegram HTML", () => {
  assert.equal(
    toTelegramHtml(
      "Итого **45 000 сум**, _примерно_, код `a<b`, [Афиша](https://afisha.uz/ru?a=1&b=2)",
    ),
    'Итого <b>45 000 сум</b>, <i>примерно</i>, код <code>a&lt;b</code>, <a href="https://afisha.uz/ru?a=1&amp;b=2">Афиша</a>',
  );
});

test("everything else is escaped and unpaired markers stay as written", () => {
  assert.equal(toTelegramHtml("1 < 2 & 3 > 2"), "1 &lt; 2 &amp; 3 &gt; 2");
  assert.equal(toTelegramHtml("5 ** 2 и snake_case_name"), "5 ** 2 и snake_case_name");
  assert.equal(toTelegramHtml("**начало\nконец**"), "**начало\nконец**");
  assert.equal(toTelegramHtml("[не ссылка](javascript:alert)"), "[не ссылка](javascript:alert)");
});

test("an answer still being written hides the marker that is not closed yet", () => {
  assert.equal(toTelegramHtml("Фильм **Обит", true), "Фильм Обит");
  assert.equal(toTelegramHtml("Смотри [Афи", true), "Смотри Афи");
  assert.equal(toTelegramHtml("Смотри [Афиша](https://af", true), "Смотри Афиша");
  assert.equal(toTelegramHtml("**Готово** и _почти", true), "<b>Готово</b> и почти");
});

test("the plain version drops the markup but keeps the link addresses", () => {
  assert.equal(
    toPlainText("**Итого** <45 000> [Афиша](https://afisha.uz)"),
    "Итого <45 000> Афиша (https://afisha.uz)",
  );
});

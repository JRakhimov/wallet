import assert from "node:assert/strict";
import { test } from "node:test";
import OpenAI from "openai";
import { sourcesOf, withoutCitations } from "../src/assistant/assistant-model";

test("the sources of an answer are its URL citations, each page once", () => {
  const citation = (url: string, title: string) => ({
    type: "url_citation",
    url,
    title,
    start_index: 0,
    end_index: 1,
  });
  const output = [
    { type: "web_search_call", id: "ws", status: "completed" },
    {
      type: "message",
      id: "m",
      role: "assistant",
      status: "completed",
      content: [
        {
          type: "output_text",
          text: "…",
          annotations: [
            citation("https://korzinka.uz/stores", "Корзинка"),
            { type: "file_citation", file_id: "f", filename: "x", index: 0 },
            citation("https://korzinka.uz/stores", "Корзинка"),
            citation("https://yandex.uz/maps", "Яндекс Карты"),
          ],
        },
      ],
    },
  ] as unknown as OpenAI.Responses.ResponseOutputItem[];

  assert.deepEqual(sourcesOf(output), [
    { title: "Корзинка", url: "https://korzinka.uz/stores" },
    { title: "Яндекс Карты", url: "https://yandex.uz/maps" },
  ]);
});

test("the links OpenAI puts in where it cites a page are removed from the text", () => {
  const text = [
    "Фильмы: «Диггер», «Арахнид». ([afisha.uz](https://www.afisha.uz/ru?utm_source=openai))",
    "Сеансы с 10:00 [kino.uz](https://kino.uz/?utm_source=openai).",
    "Подробнее: [расписание](https://kino.uz/schedule)",
  ].join("\n");

  assert.equal(
    withoutCitations(text),
    [
      "Фильмы: «Диггер», «Арахнид».",
      "Сеансы с 10:00.",
      "Подробнее: [расписание](https://kino.uz/schedule)",
    ].join("\n"),
  );
});

test("the sources lose the tracking parameter OpenAI adds", () => {
  const output = [
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: "…",
          annotations: [
            {
              type: "url_citation",
              url: "https://www.afisha.uz/ru?utm_source=openai",
              title: "Афиша",
              start_index: 0,
              end_index: 1,
            },
          ],
        },
      ],
    },
  ] as unknown as OpenAI.Responses.ResponseOutputItem[];

  assert.deepEqual(sourcesOf(output), [{ title: "Афиша", url: "https://www.afisha.uz/ru" }]);
});

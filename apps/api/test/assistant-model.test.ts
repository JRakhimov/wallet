import assert from "node:assert/strict";
import { test } from "node:test";
import OpenAI from "openai";
import { sourcesOf } from "../src/assistant/assistant-model";

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

import assert from "node:assert/strict";
import { test } from "node:test";
import { mealAnalysisUserText } from "../src/nutrition/analysis/meal-analysis.prompt";
import { mealAnalysisJsonSchema } from "../src/nutrition/analysis/meal-analysis.schema";
import { MealAnalysisError } from "../src/nutrition/analysis/meal-analyzer";
import { parseAnalysis } from "../src/nutrition/analysis/parse-analysis";

const item = {
  name: "Плов",
  grams: 350,
  kcal: 612.345,
  proteinG: 18,
  fatG: 24,
  carbsG: 80,
  confidence: "medium" as const,
};

test("JSON schema is strict and has no dialect marker", () => {
  const schema = mealAnalysisJsonSchema as {
    $schema?: string;
    required: string[];
    additionalProperties: boolean;
    properties: { items: { items: { required: string[]; additionalProperties: boolean } } };
  };
  assert.equal(schema.$schema, undefined);
  assert.deepEqual(schema.required, ["items", "assumptions", "questions"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.items.items.additionalProperties, false);
  assert.deepEqual(schema.properties.items.items.required, [
    "name",
    "grams",
    "kcal",
    "proteinG",
    "fatG",
    "carbsG",
    "confidence",
  ]);
});

test("provider output is validated, rounded and cleaned", () => {
  const result = parseAnalysis(
    JSON.stringify({
      items: [item, { ...item, name: "  ", grams: 10 }, { ...item, name: "Чай", grams: -5 }],
      assumptions: ["  масло ~10 г  ", ""],
      questions: [],
    }),
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].kcal, 612.3);
  assert.deepEqual(result.assumptions, ["масло ~10 г"]);
});

test("malformed provider output becomes an owner-facing error", () => {
  assert.throws(() => parseAnalysis("not json"), MealAnalysisError);
  assert.throws(() => parseAnalysis(JSON.stringify({ items: [] })), MealAnalysisError);
  assert.throws(() => parseAnalysis(null), MealAnalysisError);
});

test("correction requests include the previous estimate", () => {
  const text = mealAnalysisUserText({
    comment: "плов",
    clarification: "порция в два раза больше",
    previous: { items: [{ ...item, kcal: 612 }], assumptions: [], questions: [] },
  });
  assert.match(text, /Плов: 350 г, 612 ккал/);
  assert.match(text, /порция в два раза больше/);
  assert.match(text, /no photo/);
});

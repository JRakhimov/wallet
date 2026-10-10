import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { rate } from "../src/common/validation/schemas";
import { convertAtRate } from "../src/wallet/currency";

const amount = (value: string) => new Prisma.Decimal(value);

test("dollars become sums at the entered rate", () => {
  assert.equal(convertAtRate(amount("100"), "USD", amount("12650")).toFixed(2), "1265000.00");
  assert.equal(convertAtRate(amount("12.5"), "USD", amount("12650.5")).toFixed(2), "158131.25");
});

test("sums become dollars at the entered rate, rounded to cents", () => {
  assert.equal(convertAtRate(amount("1265000"), "UZS", amount("12650")).toFixed(2), "100.00");
  assert.equal(convertAtRate(amount("100000"), "UZS", amount("12650")).toFixed(2), "7.91");
  assert.equal(convertAtRate(amount("1"), "UZS", amount("12650")).toFixed(2), "0.00");
});

test("an exchange rate must be a positive number with up to 6 decimals", () => {
  assert.equal(rate.safeParse("12650").success, true);
  assert.equal(rate.safeParse("12650.5").success, true);
  assert.equal(rate.safeParse("0.000079").success, true);

  assert.equal(rate.safeParse("0").success, false);
  assert.equal(rate.safeParse("0.0000000").success, false);
  assert.equal(rate.safeParse("-5").success, false);
  assert.equal(rate.safeParse("12 650").success, false);
  assert.equal(rate.safeParse("1.1234567").success, false);
});

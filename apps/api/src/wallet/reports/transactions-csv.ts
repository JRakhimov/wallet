import { DateTime } from "luxon";
import { DetailedOperation } from "../operations/operation.view";

const HEADER = [
  "ID",
  "Дата",
  "Тип",
  "Сумма",
  "Валюта",
  "Категория",
  "Со счёта",
  "На счёт",
  "Заметка",
];
// Byte order mark so Excel opens the file as UTF-8.
const BOM = "﻿";
// Cells starting with these characters are treated as formulas by spreadsheets.
const FORMULA_START = /^\s*[=+\-@]/;

/** Semicolon-separated CSV of operations, safe to open in spreadsheet apps. */
export function transactionsCsv(operations: DetailedOperation[], timezone: string) {
  const rows = operations.map((operation) => [
    operation.id,
    DateTime.fromJSDate(operation.occurredAt).setZone(timezone).toISO() ?? "",
    operation.kind,
    operation.amount.toFixed(2),
    "UZS",
    operation.category?.name ?? "",
    accountNames(operation, "from"),
    accountNames(operation, "to"),
    operation.note,
  ]);
  return BOM + [HEADER, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
}

/** Debited ("from") or credited ("to") account names of an operation. */
function accountNames(operation: DetailedOperation, side: "from" | "to") {
  return operation.entries
    .filter((entry) => entry.amount.isNegative() === (side === "from"))
    .map((entry) => entry.account.name)
    .join(", ");
}

function csvCell(value: string) {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

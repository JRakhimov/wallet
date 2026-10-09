import { money } from "@ui/lib/format";

/** Applies a keypad key ("0"–"9", "decimal", "backspace", "clear") to the typed amount. */
export function amountFromKeys(value: string, key: string) {
  if (key === "clear") return "";
  if (key === "backspace") return value.slice(0, -1);
  if (key === "decimal") return value.includes(".") ? value : (value || "0") + ".";
  if (!/^\d$/.test(key)) return value;
  const parts = value.split(".");
  if (parts.length === 2 && parts[1].length >= 2) return value;
  if (parts.length === 1 && parts[0].length >= 12) return value;
  return value === "0" ? key : value + key;
}
/** Amount as shown above the keypad: "1300.5" → "1 300,5". */
export function amountLabel(value: string) {
  const [integer, fraction] = value.split(".");
  return money(integer || 0) + (value.includes(".") ? "," + (fraction || "") : "");
}

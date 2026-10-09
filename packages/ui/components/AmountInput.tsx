import { InputHTMLAttributes, useLayoutEffect, useRef } from "react";

// Same limits as the API: up to 12 integer and 2 fraction digits.
const MAX_INTEGER_DIGITS = 12;
const MAX_FRACTION_DIGITS = 2;
const GROUP_SEPARATOR = " ";
const DECIMAL_SEPARATOR = ",";

/** Turns user input into a plain amount: "1 300 000,5" → "1300000.5". */
export function sanitizeAmount(input: string, allowNegative = false) {
  const negative = allowNegative && input.trimStart().startsWith("-");
  const [integerPart, ...fractionParts] = input
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, "")
    .split(".");
  const integer = integerPart.replace(/^0+(?=\d)/, "").slice(0, MAX_INTEGER_DIGITS);
  const fraction = fractionParts.join("").slice(0, MAX_FRACTION_DIGITS);
  const amount = fractionParts.length ? `${integer || "0"}.${fraction}` : integer;
  return negative ? `-${amount}` : amount;
}

/** Formats a plain amount for display: "1300000.5" → "1 300 000,5". */
export function formatAmount(amount: string) {
  const negative = amount.startsWith("-");
  const [integer, fraction] = amount.replace("-", "").split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
  const decimals = fraction === undefined ? "" : DECIMAL_SEPARATOR + fraction;
  return (negative ? "-" : "") + grouped + decimals;
}

/** Digits, minus and decimal separators: characters that exist in both display and raw value. */
const isSignificant = (char: string) => /[\d.,-]/.test(char);

const countSignificant = (text: string) => [...text].filter(isSignificant).length;

/** Position in `formatted` right after its `count`-th significant character. */
function caretPosition(formatted: string, count: number) {
  let seen = 0;
  for (let index = 0; index < formatted.length; index++) {
    if (seen === count) {
      return index;
    }
    if (isSignificant(formatted[index])) {
      seen++;
    }
  }
  return formatted.length;
}

type AmountInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  /** Plain amount, e.g. "1300000.5". */
  value: string;
  onChange: (value: string) => void;
  allowNegative?: boolean;
};

/** Amount field that shows digit groups ("1 300 000") while keeping a plain value. */
export function AmountInput({
  value,
  onChange,
  allowNegative = false,
  className = "field",
  ...props
}: AmountInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  // Reformatting replaces the text, so restore the caret next to the same digit.
  useLayoutEffect(() => {
    const element = input.current;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    if (element && caret !== null && element === document.activeElement) {
      element.setSelectionRange(caret, caret);
    }
  });

  function update(nextValue: string, caretCount: number) {
    pendingCaret.current = caretPosition(formatAmount(nextValue), caretCount);
    onChange(nextValue);
  }

  function handleChange(text: string, caret: number | null) {
    let next = sanitizeAmount(text, allowNegative);
    let digitsBeforeCaret = countSignificant(text.slice(0, caret ?? text.length));

    // Deleting a group separator leaves the value unchanged: delete the digit before it instead.
    const deletedSeparator = next === value && text.length < formatAmount(value).length;
    if (deletedSeparator && digitsBeforeCaret > 0) {
      next = sanitizeAmount(
        value.slice(0, digitsBeforeCaret - 1) + value.slice(digitsBeforeCaret),
        allowNegative,
      );
      digitsBeforeCaret--;
    }
    update(next, digitsBeforeCaret);
  }

  return (
    <input
      {...props}
      ref={input}
      className={className}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={formatAmount(value)}
      onChange={(event) => handleChange(event.target.value, event.target.selectionStart)}
    />
  );
}

import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Settings2 } from "lucide-react";
import { DateTime } from "luxon";
import { Operation } from "../api";
import { money } from "@ui/lib/format";

export function OperationRow({
  op,
  timezone,
  onClick,
}: {
  op: Operation;
  timezone: string;
  onClick: () => void;
}) {
  const Icon =
    op.kind === "income" || op.kind === "refund" || op.kind === "opening"
      ? ArrowDownLeft
      : op.kind === "transfer"
        ? ArrowRightLeft
        : op.kind === "adjustment"
          ? Settings2
          : ArrowUpRight;
  const sign =
    op.kind === "transfer"
      ? ""
      : op.kind === "income" || op.kind === "refund"
        ? "+"
        : op.kind === "expense"
          ? "−"
          : op.entries[0]?.amount.startsWith("-")
            ? "−"
            : "+";
  const title =
    op.kind === "refund"
      ? `Возврат · ${op.category?.name || "покупка"}`
      : op.category?.name ||
        (
          {
            transfer: "Перевод",
            adjustment: "Корректировка",
            opening: "Начальный остаток",
          } as Record<string, string>
        )[op.kind] ||
        "Операция";
  const time = DateTime.fromISO(op.occurredAt)
    .setZone(timezone)
    .setLocale("ru")
    .toFormat("d LLL · HH:mm");
  return (
    <button className="operation-row" onClick={onClick}>
      <span className="operation-icon">
        <Icon size={20} />
      </span>
      <span className="operation-text">
        <strong>{title}</strong>
        {op.note && <small>{op.note}</small>}
      </span>
      <span className="operation-side">
        <span className={"operation-amount " + (sign === "+" ? "positive" : "")}>
          {sign}
          {money(op.amount)} <small>сум</small>
        </span>
        <time className="operation-time" dateTime={op.occurredAt}>
          {time}
        </time>
      </span>
    </button>
  );
}

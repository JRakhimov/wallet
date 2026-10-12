import { BadRequestException } from "@nestjs/common";
import { DateTime } from "luxon";
import { parse } from "../validation/parse";
import { month as monthSchema } from "../validation/schemas";

/** Date range `[gte, lt)` covering a `yyyy-MM` month in the given timezone. */
export function monthRange(month: string, timezone: string) {
  parse(monthSchema, month);
  const start = DateTime.fromISO(`${month}-01`, { zone: timezone }).startOf("day");
  if (!start.isValid) {
    throw new BadRequestException("Некорректный период");
  }
  return { gte: start.toJSDate(), lt: start.plus({ months: 1 }).toJSDate() };
}

/**
 * Date range `[gte, lt)` from the start of `from` to the end of `to` (both yyyy-MM-dd,
 * inclusive) in the given timezone. A missing end leaves that side open.
 */
export function dayRange(from: string | undefined, to: string | undefined, timezone: string) {
  const day = (value: string) => {
    const start = DateTime.fromISO(value, { zone: timezone }).startOf("day");
    if (!start.isValid || value.length !== 10) {
      throw new BadRequestException("Некорректная дата");
    }

    return start;
  };

  return {
    ...(from && { gte: day(from).toJSDate() }),
    ...(to && { lt: day(to).plus({ days: 1 }).toJSDate() }),
  };
}

export function currentMonth(timezone: string) {
  return DateTime.now().setZone(timezone).toFormat("yyyy-MM");
}

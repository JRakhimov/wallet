import { DateTime } from "luxon";

/** The day a monthly charge lands in `date`'s month: a missing day moves to the month's last day. */
export function chargeDayIn(chargeDay: number, date: DateTime) {
  return Math.min(chargeDay, date.daysInMonth ?? chargeDay);
}

/** Whether a monthly charge falls on this calendar day. */
export function isChargedOn(chargeDay: number, date: DateTime) {
  return chargeDayIn(chargeDay, date) === date.day;
}

/** The next day a monthly charge happens, counting today. */
export function nextChargeDate(chargeDay: number, today: DateTime) {
  const day = today.startOf("day");

  if (chargeDayIn(chargeDay, day) >= day.day) {
    return day.set({ day: chargeDayIn(chargeDay, day) });
  }

  const nextMonth = day.plus({ months: 1 }).startOf("month");

  return nextMonth.set({ day: chargeDayIn(chargeDay, nextMonth) });
}

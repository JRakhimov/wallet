import { centsToAmount, parseCents } from "@ui/lib/format";
import { Subscription } from "../api";

/** What all subscriptions cost per month, as a plain amount. */
export function monthlyTotal(subscriptions: Subscription[]) {
  const cents = subscriptions.reduce((sum, item) => sum + (parseCents(item.amount) ?? 0), 0);

  return centsToAmount(cents);
}

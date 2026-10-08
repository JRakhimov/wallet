import { ArrowDownLeft, ArrowUpRight, CreditCard, PiggyBank, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Account, Category } from "../api";
import { categoryIcon } from "./category-icons";
import { money } from "./format";

export const icon = (name: string) => categoryIcon(name).Icon;
export type SelectChoice = {
  value: string;
  label: string;
  detail?: string;
  Icon?: LucideIcon;
};
export const accountChoices = (accounts: Account[]): SelectChoice[] =>
  accounts.map((account) => ({
    value: account.id,
    label: account.name,
    detail: `${money(account.balance)} сум`,
    Icon: account.kind === "cash" ? Wallet : account.kind === "savings" ? PiggyBank : CreditCard,
  }));
export const categoryChoices = (categories: Category[]): SelectChoice[] =>
  categories.map((category) => ({
    value: category.id,
    label: category.name,
    Icon: icon(category.icon),
  }));
export const accountKindChoices: SelectChoice[] = [
  { value: "card", label: "Карта", Icon: CreditCard },
  { value: "cash", label: "Наличные", Icon: Wallet },
  { value: "savings", label: "Сбережения", Icon: PiggyBank },
];
export const categoryKindChoices: SelectChoice[] = [
  { value: "expense", label: "Расходов", Icon: ArrowUpRight },
  { value: "income", label: "Доходов", Icon: ArrowDownLeft },
];

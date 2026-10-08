import {
  ArrowDownLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  Car,
  CirclePlus,
  Coffee,
  CreditCard,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  PiggyBank,
  Plane,
  Popcorn,
  Repeat2,
  Shapes,
  ShoppingBag,
  ShoppingBasket,
  Utensils,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Account, Category } from "../api";
import { money } from "./format";

const icons: Record<string, LucideIcon> = {
  coffee: Coffee,
  car: Car,
  house: House,
  "shopping-basket": ShoppingBasket,
  "shopping-bag": ShoppingBag,
  "heart-pulse": HeartPulse,
  popcorn: Popcorn,
  repeat: Repeat2,
  "graduation-cap": GraduationCap,
  shapes: Shapes,
  "briefcase-business": BriefcaseBusiness,
  "circle-plus": CirclePlus,
  gift: Gift,
  plane: Plane,
  utensils: Utensils,
};
export const categoryIconOptions: [string, string][] = [
  ["shapes", "Общая"],
  ["shopping-basket", "Продукты"],
  ["coffee", "Кафе"],
  ["car", "Транспорт"],
  ["house", "Дом"],
  ["shopping-bag", "Покупки"],
  ["heart-pulse", "Здоровье"],
  ["popcorn", "Развлечения"],
  ["repeat", "Подписки"],
  ["graduation-cap", "Образование"],
  ["briefcase-business", "Работа"],
  ["circle-plus", "Поступление"],
  ["gift", "Подарки"],
  ["plane", "Путешествия"],
  ["utensils", "Еда"],
];
export const icon = (name: string) => icons[name] || Shapes;
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

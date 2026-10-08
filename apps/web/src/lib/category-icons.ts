import {
  Apple,
  Award,
  Baby,
  Banknote,
  Beer,
  Bike,
  BookOpen,
  BriefcaseBusiness,
  Bus,
  Cake,
  Car,
  CarTaxiFront,
  CirclePlus,
  Cigarette,
  Code,
  Coffee,
  Coins,
  CreditCard,
  Droplet,
  Dumbbell,
  Ellipsis,
  Film,
  Flame,
  Fuel,
  Gamepad2,
  Gem,
  Gift,
  Glasses,
  GraduationCap,
  Hammer,
  HandCoins,
  HandHeart,
  HeartPulse,
  House,
  KeyRound,
  Landmark,
  Laptop,
  Music,
  Palette,
  PawPrint,
  Percent,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Popcorn,
  Receipt,
  Repeat2,
  RotateCcw,
  Sandwich,
  Scissors,
  Shapes,
  Shield,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Smartphone,
  Smile,
  Sofa,
  Sparkles,
  SquareParking,
  Stethoscope,
  Store,
  Tent,
  Ticket,
  TrainFront,
  TrendingUp,
  Tv,
  Users,
  Utensils,
  WashingMachine,
  Wifi,
  Wine,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type CategoryIconOption = { name: string; label: string; Icon: LucideIcon };

type IconGroup = { title: string; icons: CategoryIconOption[] };

const option = (name: string, label: string, Icon: LucideIcon): CategoryIconOption => ({
  name,
  label,
  Icon,
});

/**
 * Icons offered for categories, grouped for the picker. `name` is stored in the database:
 * never rename existing names, only add new ones.
 */
export const categoryIconGroups: IconGroup[] = [
  {
    title: "Еда",
    icons: [
      option("shopping-basket", "Продукты", ShoppingBasket),
      option("shopping-cart", "Супермаркет", ShoppingCart),
      option("utensils", "Ресторан", Utensils),
      option("coffee", "Кафе", Coffee),
      option("pizza", "Фастфуд", Pizza),
      option("sandwich", "Перекус", Sandwich),
      option("cake", "Сладости", Cake),
      option("apple", "Фрукты", Apple),
      option("beer", "Бар", Beer),
      option("wine", "Алкоголь", Wine),
    ],
  },
  {
    title: "Транспорт",
    icons: [
      option("car", "Автомобиль", Car),
      option("fuel", "Топливо", Fuel),
      option("car-taxi-front", "Такси", CarTaxiFront),
      option("bus", "Общественный транспорт", Bus),
      option("train-front", "Поезд", TrainFront),
      option("plane", "Перелёты", Plane),
      option("bike", "Велосипед", Bike),
      option("square-parking", "Парковка", SquareParking),
      option("wrench", "Ремонт авто", Wrench),
    ],
  },
  {
    title: "Дом и связь",
    icons: [
      option("house", "Дом", House),
      option("key-round", "Аренда", KeyRound),
      option("zap", "Электричество", Zap),
      option("droplet", "Вода", Droplet),
      option("flame", "Газ", Flame),
      option("wifi", "Интернет", Wifi),
      option("smartphone", "Мобильная связь", Smartphone),
      option("tv", "Телевидение", Tv),
      option("sofa", "Мебель", Sofa),
      option("washing-machine", "Бытовая техника", WashingMachine),
      option("hammer", "Ремонт", Hammer),
    ],
  },
  {
    title: "Покупки",
    icons: [
      option("shopping-bag", "Покупки", ShoppingBag),
      option("shirt", "Одежда", Shirt),
      option("laptop", "Электроника", Laptop),
      option("sparkles", "Косметика", Sparkles),
      option("scissors", "Красота", Scissors),
      option("gem", "Украшения", Gem),
      option("gift", "Подарки", Gift),
    ],
  },
  {
    title: "Здоровье и спорт",
    icons: [
      option("heart-pulse", "Здоровье", HeartPulse),
      option("pill", "Аптека", Pill),
      option("stethoscope", "Врачи", Stethoscope),
      option("smile", "Стоматология", Smile),
      option("glasses", "Оптика", Glasses),
      option("dumbbell", "Спорт", Dumbbell),
    ],
  },
  {
    title: "Досуг",
    icons: [
      option("popcorn", "Развлечения", Popcorn),
      option("film", "Кино", Film),
      option("ticket", "Концерты и события", Ticket),
      option("gamepad-2", "Игры", Gamepad2),
      option("music", "Музыка", Music),
      option("book-open", "Книги", BookOpen),
      option("palette", "Хобби", Palette),
      option("tent", "Отдых", Tent),
      option("cigarette", "Табак", Cigarette),
    ],
  },
  {
    title: "Семья и образование",
    icons: [
      option("users", "Семья", Users),
      option("baby", "Дети", Baby),
      option("paw-print", "Питомцы", PawPrint),
      option("graduation-cap", "Образование", GraduationCap),
    ],
  },
  {
    title: "Платежи и финансы",
    icons: [
      option("repeat", "Подписки", Repeat2),
      option("receipt", "Счета", Receipt),
      option("credit-card", "Кредит", CreditCard),
      option("percent", "Комиссии", Percent),
      option("landmark", "Налоги", Landmark),
      option("shield", "Страховка", Shield),
      option("hand-heart", "Благотворительность", HandHeart),
      option("piggy-bank", "Сбережения", PiggyBank),
    ],
  },
  {
    title: "Доходы",
    icons: [
      option("briefcase-business", "Зарплата", BriefcaseBusiness),
      option("award", "Премия", Award),
      option("code", "Фриланс", Code),
      option("store", "Бизнес", Store),
      option("trending-up", "Инвестиции", TrendingUp),
      option("coins", "Кэшбэк", Coins),
      option("hand-coins", "Возврат долга", HandCoins),
      option("rotate-ccw", "Возврат денег", RotateCcw),
      option("banknote", "Наличные", Banknote),
      option("circle-plus", "Поступление", CirclePlus),
    ],
  },
  {
    title: "Другое",
    icons: [option("shapes", "Общая", Shapes), option("ellipsis", "Прочее", Ellipsis)],
  },
];

const iconsByName = new Map(
  categoryIconGroups.flatMap((group) => group.icons).map((icon) => [icon.name, icon]),
);

export const DEFAULT_CATEGORY_ICON = "shapes";

/** Icon option by stored name; unknown names fall back to the default icon. */
export function categoryIcon(name: string): CategoryIconOption {
  return iconsByName.get(name) ?? iconsByName.get(DEFAULT_CATEGORY_ICON)!;
}

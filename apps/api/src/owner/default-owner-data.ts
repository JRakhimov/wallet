/** Starter accounts and categories created for a new owner. */
const expenseCategories: [name: string, icon: string][] = [
  ["Продукты", "shopping-basket"],
  ["Кафе", "coffee"],
  ["Транспорт", "car"],
  ["Дом", "house"],
  ["Покупки", "shopping-bag"],
  ["Здоровье", "heart-pulse"],
  ["Развлечения", "popcorn"],
  ["Подписки", "repeat"],
  ["Образование", "graduation-cap"],
  ["Другое", "shapes"],
];

const incomeCategories: [name: string, icon: string][] = [
  ["Зарплата", "briefcase-business"],
  ["Другой доход", "circle-plus"],
];

export const defaultAccount = { name: "Основная карта", kind: "card" };

export const defaultCategories = [
  ...expenseCategories.map(([name, icon], position) => ({ name, icon, position, kind: "expense" })),
  ...incomeCategories.map(([name, icon], position) => ({ name, icon, position, kind: "income" })),
];

/** What the chat shows while the model thinks: a new line each time, so a long wait feels alive. */
export const THINKING_TEXTS = [
  "Думаю…",
  "Собираюсь с мыслями…",
  "Шевелю извилинами…",
  "Складываю два и два…",
  "Прикидываю варианты…",
  "Раскладываю по полочкам…",
  "Вникаю…",
  "Соображаю…",
  "Взвешиваю…",
  "Сверяю детали…",
  "Перебираю мысли…",
  "Ищу лучший ответ…",
  "Пара секунд…",
  "Почти готово…",
];

export function thinkingText() {
  return THINKING_TEXTS[Math.floor(Math.random() * THINKING_TEXTS.length)];
}

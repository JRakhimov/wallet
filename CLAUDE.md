# CLAUDE.md

Суперапп из Telegram мини-приложений: один бот, один NestJS-бэкенд (`apps/api`), несколько React-фронтендов (`apps/web` — кошелёк, `apps/nutrition-web` — питание) с общим кодом в `packages/ui` (`@ui/*`). Приложения различаются только цветовой темой.

Перед работой прочитай **[docs/PLATFORM.md](docs/PLATFORM.md)**: стек, архитектура, дизайн-система (токены и темы), рецепт нового приложения, соглашения.

Главное:

- Пиши аккуратный, читаемый код и запускай `npm run format` после правок.
- Проверка: `npx tsc -p apps/api/tsconfig.json --noEmit`, `npx tsc --noEmit -p apps/web/tsconfig.json`, `npx tsc --noEmit -p apps/nutrition-web/tsconfig.json`, `npm test`.
- Цвета только через CSS-переменные темы. Тексты интерфейса на русском.
- Суммы — строки с двумя знаками, на бэкенде `Prisma.Decimal`, никогда не float.

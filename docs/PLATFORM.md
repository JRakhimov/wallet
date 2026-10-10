# Платформа мини-приложений

Один Telegram-бот, внутри несколько личных мини-приложений (суперапп). Бэкенд один, у каждого приложения свой фронтенд. Все приложения выглядят одинаково и отличаются только цветом.

| Приложение                | Статус                                                                          | Акцентный цвет | Фронтенд             |
| ------------------------- | ------------------------------------------------------------------------------- | -------------- | -------------------- |
| Кошелёк (учёт расходов)   | работает                                                                        | зелёный        | `apps/web`           |
| Питание (подсчёт калорий) | этапы 1–3 из [плана](nutrition-plan.md): нормы, дневник, фото и текст через LLM | синий          | `apps/nutrition-web` |
| Задачи (дела и заметки)   | работает: список дел, заметки, напоминания ботом, повторы, голос                | жёлтый         | `apps/tasks-web`     |

Документ описывает то, что есть в коде сейчас.

---

## 1. Технический стек

| Слой           | Технологии                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| Язык           | TypeScript 5.9, `strict`                                                                                   |
| Рантайм        | Node.js ≥ 22.12                                                                                            |
| Бэкенд         | NestJS 11 (Express), Prisma 6.19, PostgreSQL, zod 3 для валидации, luxon для дат и часовых поясов, helmet  |
| Фронтенд       | React 19, Vite 7, TanStack Query 5 (+ persist-client для кеша на устройстве), lucide-react (иконки), luxon |
| Стили          | Обычный CSS, один файл `styles.css`, CSS-переменные для темы. Без Tailwind и CSS-in-JS                     |
| Telegram       | Mini Apps SDK (`telegram-web-app.js`), бот работает через long polling в API                               |
| Форматирование | Prettier 3, ширина строки 100: `npm run format`, проверка `npm run format:check`                           |
| Тесты          | `node:test` (`npm test`), интеграционные с БД: `npm run test:integration`                                  |
| Деплой         | Docker Compose: `api` (Node) + `web` (nginx со статикой). PostgreSQL отдельно                              |

Монорепозиторий с одним `package.json` в корне, без workspaces.

---

## 2. Архитектура

```
Telegram-бот ── /start ──► сообщение с кнопками web_app (по кнопке на приложение)
             ── голосовое ─► «Принято в обработку…» → Whisper → LLM (тип, сумма, категория; тренировка с ккал; или задача с датой, временем и повтором) → операция в кошельке / тренировка / задача → «Расход 45 000 сум за обед записан», «Напомню завтра в 10:00: Позвонить в банк»
             ── кнопки под напоминанием о задаче (callback_query) ─► «Готово», «Через час», «Завтра»
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
       apps/web         apps/<app>-web       ...      каждое приложение: свой домен, nginx-контейнер
             └────────────────┼────────────────┘
                              ▼  /api/*
                         apps/api (NestJS)  ──►  PostgreSQL
```

- **Авторизация.** Telegram подписывает `initData` токеном бота. Подпись одинакова для всех мини-приложений одного бота, поэтому один эндпоинт `POST /api/auth/telegram` работает для всех фронтендов. Пользователь всего один: владелец, его ID задан в `OWNER_TELEGRAM_ID`.
- **Сессия.** Сервер выдаёт токен на 12 часов. Фронтенд хранит его в `localStorage` и передаёт как `Authorization: Bearer`. Каждый фронтенд на своём домене, поэтому у каждого своя сессия.
- **Dev-режим.** При `AUTH_MODE=dev` и `NODE_ENV=development` вход работает без Telegram. Только для локальной разработки.

### 2.1 Бэкенд: `apps/api/src`

```
main.ts              точка входа
app.factory.ts       createApp: helmet, CORS, no-store, фильтр ошибок
app.module.ts        собирает все модули
config/              readConfig() + ConfigModule (глобальный, токен CONFIG)
prisma/              PrismaService (глобальный) + ownerTransaction() — блокировка строки владельца
common/
  decorators/        @Public(), @OwnerId(), @SessionHash(), @IdempotencyKey()
  pipes/             ZodValidationPipe
  validation/        parse(), общие zod-схемы (uuid, label, money, month, version)
  filters/           ApiExceptionFilter → ответ { message }
  middleware/        RateLimitMiddleware
  utils/             hash (sha256), month (monthRange, currentMonth)
auth/                вход (Telegram / dev), глобальный AuthGuard, проверка initData
owner/               профиль и настройки владельца; OwnerSetupRegistry — стартовые данные приложений
health/              GET /api/health
access/              AccessService: кто может пользоваться — администратор (OWNER_TELEGRAM_ID) и выданные им доступы (таблица AccessGrant)
telegram/            бот: /start с кнопками Mini App, /help со справкой и голосовые сообщения пользователей с доступом; администратор управляет доступом командами /access и /revoke, остальным бот не отвечает
telegram/reminder*   напоминания со звуком каждому пользователю с доступом: 14:00 нет приёмов пищи; 20:00 нет ужина и/или меньше 2 расходов (по времени пользователя, раз в день); подписки: в 18:00 за день до списания и в 08:00 в день списания
telegram/task-reminder.service.ts  напоминания о задачах точно в срок (тик раз в минуту) с кнопками «Готово», «Через час», «Завтра»; кнопки обрабатывает TelegramBotService.handleCallback
voice/               голос → операция, тренировка или задача: SpeechToText (Whisper), TransactionParser (LLM, получает текущее время владельца), VoiceTransactionService
tasks/               приложение «Задачи»: TasksModule (маршруты /api/tasks), recurrence.ts — повторы и момент напоминания, labels.ts — подписи по-русски
wallet/              приложение «Кошелёк»
  wallet.module.ts   собирает модули кошелька, регистрирует его стартовые данные
  wallet-defaults.ts стартовый счёт и категории
  accounts/ categories/ operations/ budgets/ subscriptions/ reports/
```

Общие модули (`auth`, `owner`, `telegram`, `prisma`, `config`, `common`, `health`) лежат в корне `src/`. Каждое мини-приложение — отдельная папка со своим корневым модулем (`wallet/wallet.module.ts`), который подключается в `app.module.ts`.

**Правила модулей:**

- В каждом модуле `*.module.ts`, `*.controller.ts`, `*.service.ts`, схемы входных данных лежат в `dto/*.dto.ts`: zod-схема и `type XDto = z.infer<...>`.
- Контроллер тонкий: валидирует данные через `@Body(new ZodValidationPipe(schema))`, получает владельца через `@OwnerId()` и вызывает сервис.
- Все маршруты закрыты `AuthGuard`. Публичные помечаются `@Public()`.
- Все данные принадлежат владельцу (`ownerId`), и каждый запрос к БД фильтруется по `ownerId`.
- **Доступ.** Войти и писать боту могут только администратор (`OWNER_TELEGRAM_ID`) и пользователи, которым он выдал доступ командой `/access <telegramId>` в личке бота (`/access` без id показывает список, `/revoke <telegramId>` отзывает доступ и завершает сессии). Остальным бот не отвечает, а API возвращает 403. Права проверяются на каждый запрос (`AuthGuard` → `AccessService.isAllowed`). Telegram id узнать можно, например, через @userinfobot; выданный доступ работает, когда человек уже открывал бота.
- Записи, которые меняют связанные данные, идут через `prisma.ownerTransaction(ownerId, tx => …)`.
- Ошибки — `HttpException` с русским текстом. Фронтенд показывает `message` пользователю как есть.
- Создание сущностей, которые нельзя дублировать, идемпотентно: клиент шлёт заголовок `Idempotency-Key` (UUID).
- Оптимистичная блокировка через поле `version` при изменении и удалении.
- Суммы — `Decimal(20, 2)` в БД и строки `"1300000.50"` в API. Дробные суммы никогда не хранятся во float.
- **Валюты кошелька.** Счёт бывает в `UZS` или `USD` (валюта задаётся при создании и не меняется), операция хранит валюту своего счёта. Перевод между счетами в разных валютах требует курс — сумы за 1 $, его вводит пользователь; он хранится в `Operation.rate` (`Decimal(20, 6)`), а зачисление считает сервер (`wallet/currency.ts`, округление до центов). Отчёты, бюджет, динамика, подписки и голосовые команды работают только в сумах: операции со счетов в $ в них не попадают.

**Несколько приложений на одном API:**

- **Стартовые данные.** Владелец создаётся при первом входе (`OwnerService.ensureOwner`). Каждое приложение регистрирует свои стартовые данные в `onModuleInit` своего корневого модуля: `ownerSetups.register(async (tx, ownerId) => …)`. Регистрации выполняются в одной транзакции с созданием владельца. Пример — `wallet/wallet.module.ts`.
- **Маршруты.** У нового приложения маршруты с префиксом: `@Controller("nutrition/meals")` → `/api/nutrition/meals`. Маршруты кошелька остаются без префикса (`/api/accounts` и т.д.), чтобы не ломать фронтенд.
- **Таблицы.** Таблицы приложения связаны с `Owner`. Общие таблицы: `Owner`, `Session`, `BotUpdate`.
- В `Owner` есть поля, оставшиеся от кошелька (`name` = «Мой кошелёк», `theme`). Настройки нового приложения лучше хранить в его собственной таблице.

### 2.2 Фронтенд

Общий код всех фронтендов лежит в `packages/ui`, приложения подключают его через алиас `@ui/*`.

```
packages/ui/
  styles/
    themes/green.css   токены зелёной темы (кошелёк)
    themes/blue.css    токены синей темы (питание)
    themes/yellow.css  токены жёлтой темы (задачи)
    base.css           общие стили: оболочка, кнопки, поля, шторки, селекты, списки, состояния
  components/
    AppShell.tsx       шапка с названием и иконкой, тост, прокручиваемый main, нижняя навигация
    CenterState.tsx    полноэкранные состояния: загрузка, ошибка входа, истёкшая сессия
    Sheet.tsx          шторка + SheetPresence (анимация закрытия)
    SelectField.tsx    выпадающий выбор (+ тип SelectChoice)
    AmountInput.tsx    поле суммы с разделителями разрядов
    MonthSwitch.tsx    переключатель месяца
    ThemeSelect.tsx    выбор темы (настройка владельца, общая для всех приложений)
  lib/
    platform.ts        configurePlatform({ appId, apiBaseUrl }); storageKey("session") → "wallet.session"
    api-client.ts      request(), ApiError, login()/relogin(), apiUrl(), authHeaders()
    useAuth.ts         useAuth(): вход при запуске; useSessionExpiry(): тихий повторный вход при 401
    owner.ts           тип Owner, useOwner() (GET /api/me), saveTheme()
    useThemeSync.ts    тема владельца → <html data-theme> и цвета шапки Telegram
    session.ts         хранение токена между запусками
    telegram.ts        SDK: загрузка, ready/expand, цвета шапки, closeTelegramApp()
    query.tsx          QueryProvider: React Query + сохранение кеша на устройстве
    format.ts          money, суммы, даты (today, monthLabel, occurrenceForDay)
  vite/mini-app-config.ts  общий конфиг Vite: алиас @ui, preload SDK Telegram, прокси /api
  tsconfig.app.json   общий tsconfig фронтендов (алиас @ui)

apps/web/src/          кошелёк
  main.tsx             configurePlatform({ appId: "wallet" }), стили, QueryProvider (CACHE_VERSION)
  App.tsx              вход, общие запросы, тема, оболочка, вкладки
  api.ts               типы ответов API кошелька, downloadCsv
  styles.css           стили, которые есть только в кошельке
  lib/                 choices, category-icons, keypad, useRefresh
  components/          IconSelect, CategoryIcon, OperationRow
  panels/              содержимое шторок: AccountsPanel, CategoriesPanel, BudgetPanel, EntryPanel, OperationPanel
  pages/               вкладки: HomePage, HistoryPage, ReportsPage, MorePage (+ useExpenseDraft)

apps/nutrition-web/src/   питание
  main.tsx             configurePlatform({ appId: "nutrition" }), синяя тема
  App.tsx              вход, профиль; без профиля — онбординг, с профилем — вкладки
  api.ts               типы и запросы профиля
  components/          AddMealFlow, MealReview, MealCard, BodyFields, CalorieRing, MacroCards, PlanSummary, TargetsPanel
  pages/               Onboarding, TodayPage, HistoryPage, ProfilePage
  lib/                 labels (подписи), image (сжатие фото), meal-names (названия по времени)

apps/tasks-web/src/       задачи
  main.tsx             configurePlatform({ appId: "tasks" }), жёлтая тема
  App.tsx              вход, список задач, шторка задачи, вкладки
  api.ts               тип Task, useTasks() (ключ ["tasks"]), запросы, useTaskCache()
  components/          TaskRow, TaskSection, TaskSheet
  pages/               TodayPage (просрочено + сегодня), PlansPage (по дням), NotesPage (без срока), MorePage (выполненные, тема)
  lib/                 due (даты и группы), repeat (подписи повторов)

docker/
  mini-app.Dockerfile      сборка любого фронтенда: --build-arg APP=<папка в apps/>
  mini-app.nginx.conf      nginx: статика, кеширование, gzip, прокси /api
```

**Подключение `@ui`:** приложению достаточно двух коротких файлов:

- `vite.config.ts` вызывает `miniAppViteConfig(new URL(".", import.meta.url), { port, allowedHosts })`;
- `tsconfig.json` расширяет `packages/ui/tsconfig.app.json` и задаёт `include`.

Образ собирается общим `docker/mini-app.Dockerfile` с `APP=<папка>`. Пример — `apps/nutrition-web`.

**Оболочка приложения** собирается из общих частей:

- `useAuth()` и `useSessionExpiry()` — вход;
- `useOwner()` и `useThemeSync()` — тема;
- `CenterState` — экраны загрузки и ошибок;
- `AppShell` — шапка, навигация и содержимое.

`App.tsx` приложения содержит только свои запросы и вкладки.

**Порядок стилей** в `main.tsx`: тема, затем `base.css`, затем `styles.css` приложения. Стили приложения идут последними и могут уточнять общие.

**Где размещать код:** если компонент, хелпер или стиль нужен больше чем одному приложению, он идёт в `packages/ui`. Специфичное для одного приложения остаётся в `apps/<app>`. Код `packages/ui` не импортирует ничего из `apps/*`.

**Правила фронтенда:**

- Страница владеет своим состоянием и своими шторками. В `App` — только то, что нужно нескольким страницам: месяц, черновик расхода, тосты.
- Данные загружаются только через TanStack Query. Ключи кошелька: `["owner"]`, `["accounts"]`, `["categories"]`, `["summary", month]`, `["operations", ...]`, `["trash", month]`. После изменения данных вызывается `useRefresh()`.
- При запуске приложение сразу показывает сохранённый кеш и обновляет его в фоне. После изменения формата ответов API нужно увеличить `CACHE_VERSION` в `main.tsx` приложения.
- Ключи `localStorage` строятся через `storageKey()` и начинаются с `appId`: `wallet.session`, `wallet.query-cache`.
- Все тексты интерфейса на русском. Суммы показываются как `1 300 000 сум`.

---

## 3. Дизайн-система

### 3.1 Принципы

- Мобильный интерфейс в первую очередь. Ширина приложения не больше 480px. На экране от 600px приложение показывается карточкой по центру.
- Светлая и тёмная тема. Режим «Система» следует настройке ОС, выбранная тема хранится в `data-theme` на `<html>`.
- Цвет приложения задаётся только CSS-переменными. В компонентах не должно быть ни одного hex-цвета.
- Нейтральные цвета (фон, поверхности, рамки, текст) слегка окрашены в тон акцента. Поэтому тема приложения — это вся палитра, а не только `--accent`.
- Шапка Telegram окрашивается в цвет приложения через `syncTelegramColors()`: она берёт `--surface` и `--bg`.

### 3.2 Токены

Цвета для каждой темы задаются в таких переменных:

| Токен            | Назначение                                              |
| ---------------- | ------------------------------------------------------- |
| `--bg`           | фон приложения                                          |
| `--surface`      | карточки, поля, шапка, нижняя навигация                 |
| `--surface-soft` | вторичные поверхности, выпадающие списки                |
| `--text`         | основной текст                                          |
| `--muted`        | второстепенный текст, подписи, иконки                   |
| `--border`       | рамки и разделители                                     |
| `--accent`       | основной цвет: кнопки, активные элементы, суммы доходов |
| `--accent-soft`  | фон выбранного элемента, тосты, фон иконок              |
| `--accent-on`    | текст на `--accent`                                     |
| `--danger`       | ошибки и удаление                                       |
| `--scrim`        | затемнение под шторкой                                  |
| `--shadow`       | тень карточки на десктопе                               |

#### Зелёная тема: кошелёк (текущая)

| Токен            | Светлая                 | Тёмная                  |
| ---------------- | ----------------------- | ----------------------- |
| `--bg`           | `#f6f7f4`               | `#151d18`               |
| `--surface`      | `#ffffff`               | `#222d25`               |
| `--surface-soft` | `#eef3ed`               | `#2a3a2e`               |
| `--text`         | `#203029`               | `#eef5ed`               |
| `--muted`        | `#6d7d70`               | `#abbab0`               |
| `--border`       | `#e3e9e1`               | `#3b4a3f`               |
| `--accent`       | `#286c4d`               | `#a8d9bb`               |
| `--accent-soft`  | `#e3f0e6`               | `#304d3a`               |
| `--accent-on`    | `#ffffff`               | `#203629`               |
| `--danger`       | `#b4413b`               | `#ffaaa2`               |
| `--shadow`       | `0 16px 60px #182b2117` | `0 18px 55px #080e0a50` |

`--scrim`: `#060b0870` в зелёной теме, `#06080b70` в синей (одинаково для светлой и тёмной).

#### Синяя тема: второе приложение

Построена так же, как зелёная: тот же контраст и та же насыщенность, только тон синий.

| Токен            | Светлая                 | Тёмная                  |
| ---------------- | ----------------------- | ----------------------- |
| `--bg`           | `#f5f7fa`               | `#141a22`               |
| `--surface`      | `#ffffff`               | `#1f2733`               |
| `--surface-soft` | `#ecf1f8`               | `#263244`               |
| `--text`         | `#1f2a37`               | `#edf2f8`               |
| `--muted`        | `#6b7889`               | `#a9b6c6`               |
| `--border`       | `#e1e7ef`               | `#374355`               |
| `--accent`       | `#2a5ea8`               | `#a9c8f0`               |
| `--accent-soft`  | `#e3ecf8`               | `#2c3f5a`               |
| `--accent-on`    | `#ffffff`               | `#1d2c42`               |
| `--danger`       | `#b4413b`               | `#ffaaa2`               |
| `--shadow`       | `0 16px 60px #18233117` | `0 18px 55px #080b1050` |

#### Жёлтая тема: задачи

Светлота и насыщенность нейтральных токенов как у зелёной, тон янтарный (~44°). Акцент чуть насыщеннее, чтобы читался жёлтым; контраст проверен (`--accent-on` на `--accent` ≥ 5:1).

| Токен            | Светлая                 | Тёмная                  |
| ---------------- | ----------------------- | ----------------------- |
| `--bg`           | `#f7f6f2`               | `#1d1b15`               |
| `--surface`      | `#ffffff`               | `#2d2a22`               |
| `--surface-soft` | `#f3f0e6`               | `#3a362a`               |
| `--text`         | `#302c20`               | `#f5f3ed`               |
| `--muted`        | `#7d796d`               | `#bab6ab`               |
| `--border`       | `#e9e6dc`               | `#4a463b`               |
| `--accent`       | `#855f00`               | `#f2cf6b`               |
| `--accent-soft`  | `#f7edcf`               | `#4d4128`               |
| `--accent-on`    | `#ffffff`               | `#33290b`               |
| `--danger`       | `#b4413b`               | `#ffaaa2`               |
| `--shadow`       | `0 16px 60px #2b261817` | `0 18px 55px #0e0c0850` |

**Как сделать тему для нового цвета:**

1. Выбрать тон (hue) акцента.
2. Взять зелёную палитру, оставить светлоту и насыщенность каждого токена, поменять тон.
3. Проверить контраст: `--text` на `--bg` и `--accent-on` на `--accent` должны быть не ниже 4.5:1.

Тема — это файл `packages/ui/styles/themes/<цвет>.css` с тремя блоками: `:root`, `:root[data-theme="dark"]` и `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`. За образец берётся `blue.css`. Ещё нужно обновить `<meta name="theme-color">` в `index.html` приложения.

### 3.3 Типографика

- Шрифт: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Размеры:
  - 11px — подписи вкладок, заголовки групп в верхнем регистре;
  - 12–13px — вторичный текст;
  - 14px — строки списков;
  - 15px — основной текст и кнопки;
  - 16px — поля ввода (меньше нельзя, иначе iOS увеличивает страницу при фокусе);
  - 20px — заголовок шторки;
  - заголовки страниц и большая сумма крупнее.
- Начертания: 400 — обычный текст, 600 — акценты в строках, 700 — кнопки и заголовки.
- Числа в суммах: `font-variant-numeric: tabular-nums`.

### 3.4 Форма и размеры

- Скругления:
  - 9–10px — мелкие элементы и пункты списков;
  - 12px — поля и иконочные кнопки;
  - 14px — кнопки и блоки;
  - 22–23px — шторка;
  - 99px — бейджи и «пилюли».
- Высота интерактивных элементов не меньше 40px. Основные кнопки — 51px, поля — 47px.
- Горизонтальные отступы страницы — 20px (15px на узких экранах).
- Отступы безопасных зон: `env(safe-area-inset-*)` и `var(--tg-safe-area-inset-*)`, особенно у нижней навигации.

### 3.5 Компоненты: CSS-классы и React

| Что           | Как использовать                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Оболочка      | `.app-shell` > `.app-header` + `.main` (прокручивается только он) + `.bottom-nav`                        |
| Страница      | `.page` > `.page-heading` (h1 + действия), `.section-title`                                              |
| Кнопки        | `.primary`, `.secondary`, `.quiet`, `.text-button`, `.icon-btn`, `.danger-link`; `.full` — на всю ширину |
| Поле          | `.field` внутри `label.field-label`. Сумма — `<AmountInput>`, выбор — `<SelectField>`                    |
| Шторка        | `<SheetPresence>{open && <Sheet title onClose>…</Sheet>}</SheetPresence>`, внутри `.sheet-body`          |
| Списки        | `.menu-row` (пункт меню со стрелкой), `.manage-row` (строка с действиями), `.operation-row`              |
| Переключатель | `.segmented` с `button.active`                                                                           |
| Состояния     | `.center-state` (загрузка, ошибка), `.loader`, `.empty`, `.form-error`, `.toast`                         |
| Иконки        | lucide-react: 20px в строках, 16–19px в мелких местах. Иконка в плашке — `.cat-icon`                     |

**Поведение шторки:** выезжает снизу и уезжает вниз при закрытии (0,28 с и 0,2 с). Закрывается по Escape, тапу по фону и кнопке «Назад» в Telegram. Пока шторка открыта, страница под ней не прокручивается.

### 3.6 Движение

- Анимации короткие (0,2–0,3 с) и только у появления и закрытия.
- При `prefers-reduced-motion: reduce` анимации выключаются.

### 3.7 Настройки Telegram (`lib/telegram.ts`)

При запуске вызываются:

- `ready()`;
- `expand()` — режим fullsize;
- `disableVerticalSwipes()` — прокрутка не закрывает приложение;
- `syncTelegramColors()`.

SDK загружается асинхронно, `<link rel="preload">` добавляется плагином в `vite.config.ts`.

---

## 4. Как поднять новое приложение

Пример: приложение `nutrition` с синей темой.

1. **Бэкенд** (`apps/api/src/nutrition/`).
   - Модули по образцу `wallet/`: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`. Использовать `common/`, `@OwnerId()`, `ZodValidationPipe`, `ownerTransaction`.
   - Корневой `nutrition.module.ts` импортирует модули приложения и, если нужны стартовые данные, регистрирует их через `OwnerSetupRegistry` (как `WalletModule`).
   - Контроллеры с префиксом `nutrition/...`.
   - Подключить `NutritionModule` в `app.module.ts`.
   - Описать таблицы в `apps/api/prisma/schema.prisma`, связать их с `Owner` и создать миграцию.
2. **Фронтенд** (`apps/<app>-web/`). Образец — `apps/nutrition-web`.
   - `index.html` (свой `theme-color` и заголовок), `vite.config.ts` (свой порт и домены), `tsconfig.json` — по образцу, это несколько строк.
   - `src/main.tsx`: `configurePlatform({ appId: "<app>" })` и тема `@ui/styles/themes/<цвет>.css`.
   - `src/App.tsx`: `useAuth`, `useOwner`, `useThemeSync`, `CenterState`, `AppShell` со своими вкладками, названием и иконкой.
   - Специфичные стили — в `src/styles.css` приложения. То, что пригодится другим приложениям, — сразу в `packages/ui`.
3. **Инфраструктура.**
   - Сервис в `docker-compose.yml` по образцу `nutrition-web`: `dockerfile: docker/mini-app.Dockerfile`, `APP: <app>-web`, свой порт.
   - Домен приложения в `ALLOWED_ORIGINS`.
   - Скрипты `dev:<app>` и `build:<app>` в `package.json`, добавить приложение в `dev` и `build`.
4. **Бот.** URL приложения в конфиг (`<APP>_APP_URL` в `app-config.ts`, по образцу `NUTRITION_APP_URL`) и строка в `appButtons()` в `apps/api/src/telegram/telegram-bot.service.ts`. Кнопка появляется, только если URL задан.

---

## 5. Соглашения по коду

- Код аккуратный и читаемый: одна инструкция на строку, у `if` фигурные скобки, именованные константы вместо «магических» чисел, понятные имена, небольшие функции. После правок — `npm run format`.
- Комментарии объясняют «почему», а не «что».
- Ни одного hex-цвета вне блоков токенов.
- Ни одного импорта из `apps/*` внутри `packages/ui`.
- Новые иконки категорий добавляются только в `apps/web/src/lib/category-icons.ts`. Существующие `name` переименовывать нельзя, они хранятся в БД.

## 6. Окружение и команды

| Команда                                                    | Что делает                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                                              | API (3001) + кошелёк (5173) + питание (5174) + задачи (5175) |
| `npm run dev:api`, `dev:web`, `dev:nutrition`, `dev:tasks` | по отдельности                                               |
| `npm run build`                                            | собрать всё (`build:web`, `build:nutrition`, `build:tasks`)  |
| `npm test`, `npm run test:integration`                     | тесты                                                        |
| `npm run db:migrate`, `npm run db:studio`                  | миграции и просмотр БД                                       |
| `npm run format`                                           | Prettier                                                     |
| `docker compose up --build -d`                             | api + web + nutrition-web + tasks-web в Docker               |

Переменные окружения описаны с комментариями в `.env.example`.

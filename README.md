# Синий флаг

Игра-бинго с «пиками»: игроки собирают карточки, администратор отмечает результаты, считается рейтинг.

**Стек:** Node.js + Express (JSON API) · PostgreSQL · React 18 + Vite + React Router.

## Запуск для разработки

```bash
cp .env.example .env        # заполните DATABASE_URL, SESSION_SECRET, ADMIN_*
npm install                 # ставит зависимости сервера и клиента (npm workspaces)
npm run dev:server          # API на http://localhost:3000 (миграции применяются сами)
npm run dev:client          # клиент на http://localhost:5173, /api проксируется на сервер
```

Если сервер слушает не 3000, запустите клиент так: `API_PORT=3100 npm run dev:client`.

## Production

```bash
npm install && npm run build      # собирает клиент в client/dist
NODE_ENV=production npm start     # Express отдаёт и API, и собранный клиент
```

В production обязательны `SESSION_SECRET` и `DATABASE_URL`. За прокси задайте `TRUST_PROXY=1`.

## Проверки

```bash
npm test                                           # юнит-тесты доменной логики (без БД)
BASE=http://localhost:3000 ADMIN=admin:пароль \
  npm run smoke -w server                          # сквозная проверка API на запущенном сервере
```

## Структура

```
server/src
  config.js            переменные окружения (единая точка чтения)
  app.js, index.js     сборка Express-приложения и запуск
  domain/rules.js      правила игры: очки, размер карточки, ранги — единственный источник
  db/                  pool + tx(), раннер миграций, migrations/*.sql, создание админа
  repositories/        весь SQL (users, events+picks+people, cards+рейтинги)
  services/            бизнес-логика (карточки, рулетка, админка, импорт)
  routes/              тонкие HTTP-обработчики (auth, events, admin)
  middleware/http.js   сессия, CSRF, проверка ролей, обработка ошибок
client/src
  api/                 fetch-обёртка (CSRF, ошибки) и хук useApi
  context/             Auth (пользователь + правила очков) и Toast (замена flash)
  components/          Layout, общие UI-элементы, защита маршрутов
  features/            auth/, events/ (карточка, выбор, рулетка), admin/
  styles/style.css     прежний CSS без изменений
```

## Как вносить изменения

| Задача | Где менять |
|---|---|
| Набор очков пиков или размер карточки | `server/src/domain/rules.js` (клиент подхватит через `/api/me`) |
| Формула подсчёта очков | новая миграция, `CREATE OR REPLACE VIEW card_scores` |
| Изменение схемы БД | новый файл `server/src/db/migrations/00N_*.sql` (применяется один раз при старте) |
| Новый эндпоинт | repository → service → route, затем страница в `client/src/features` |

## Обновление существующей установки

База совместима: при первом запуске применятся миграции 001–003 (001 безопасно пропускается на существующей схеме),
данные, пользователи и сессии сохраняются. Старые HTML-формы (`POST /login` и т.п.) больше не существуют — всё идёт через `/api/*`.

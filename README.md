<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/83290a4a-8f7f-4dbd-a3cf-52df8dad5373

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Скопируйте [.env.example](.env.example) в `.env` и укажите `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` (Supabase → Settings → API).
3. (Необязательно) Для сценариев AI Studio можно задать `GEMINI_API_KEY` в `.env.local`.
4. Запуск: `npm run dev`

## Деплой на GitHub Pages (`/saas-fit/`)

Проект настроен на подкаталог: в production `vite` использует `base: '/saas-fit/'` (см. `vite.config.ts`). После `npm run build` в `dist/index.html` пути к скриптам и стилям вида `/saas-fit/assets/...`.

1. **Репозиторий:** Settings → Pages → **Build and deployment** → Source: **GitHub Actions**.
2. **Секреты для сборки:** Settings → Secrets and variables → Actions — добавьте `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` (те же значения, что в `.env` для локальной разработки). Без них приложение соберётся с заглушками: интерфейс откроется, но запросы к Supabase не заработают до пересборки с переменными.
3. Пуш в ветку `main` или `master` запускает workflow `.github/workflows/deploy-pages.yml`.

Локальная проверка путей: `npm run build` и откройте `dist/index.html` — ссылки на ассеты должны начинаться с `/saas-fit/`.

## Личный кабинет клиента

1. **SQL:** в Supabase → SQL Editor выполните файл [supabase/migrations/001_client_cabinet.sql](supabase/migrations/001_client_cabinet.sql).
2. **Whitelist:** добавьте телефон клиента в `customers_db` (пример в конце SQL-файла).
3. **Баланс:** после регистрации пополните `profiles.balance` (или задайте `initial_balance` в metadata при регистрации через SQL/админку).
4. **Маршруты:** `/login` — вход по телефону и паролю; `/dashboard` — кабинет (на GitHub Pages: `/saas-fit/login`, `/saas-fit/dashboard`).
5. **QR на ресепшене:** текст кода `fitcrm-client-checkin` (клиент сканирует его при отметке).

**Auth:** Supabase Email provider; логин — синтетический email `79XXXXXXXXX@phone.fitcrm.local`. Для теста можно отключить подтверждение email в Authentication → Providers → Email.

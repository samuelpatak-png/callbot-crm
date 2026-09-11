# CallBot CRM

Outbound CRM pre telefónne čísla, hovory, poznámky, termíny a automatizované kampane.

Aplikácia beží na **Vercel**, databáza na **Neon Postgres**. Nič netreba spúšťať na localhost.

## Čo je hotové

- zoznam telefónnych čísel s kliknutím na **Volat**
- karty kontaktov: poznámky, follow-up dátumy, stav, DNC
- pipeline dealov
- kampane so **spusti / pozastav / zastav**
- automatický dialer (simulačný adaptér, neskôr Twilio + ChatGPT Realtime)
- import CSV
- cron + reťazenie hovorov bez zásahu človeka

## Prihlásenie

Predvolený účet po seede:

- e-mail: `admin@callbot.local`
- heslo: hodnota `INITIAL_ADMIN_PASSWORD` na Verceli (predvolene `CallBot2026!`)

## Premenné prostredia

Pozri `.env.example`. Povinné:

- `DATABASE_URL` — Neon (doplní Vercel integrácia)
- `AUTH_SECRET`
- `CRON_SECRET`
- `APP_URL` — produkčná URL

Voliteľné neskôr: `TWILIO_*`, `OPENAI_API_KEY`.

## Git a návraty

Každý funkčný stav je na `main`. Pri nepodarenej pokročilej verzii sa vráť commitom späť — história ostane na GitHub.

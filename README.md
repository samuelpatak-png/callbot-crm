# CallBot CRM

Outbound CRM pre telefónne čísla, hovory, poznámky, termíny a automatizované kampane.

Aplikácia beží na **Vercel** na adrese [https://callbot-crm.vercel.app](https://callbot-crm.vercel.app). Databáza je **Neon Postgres**. Nič netreba spúšťať na localhost.

## Čo je hotové

- zoznam telefónnych čísel s kliknutím na **Volat**
- karty kontaktov: poznámky, follow-up dátumy, stav, DNC
- pipeline dealov (úspešný hovor otvorí lead)
- kampane so **spusti / pozastav / zastav**, pracovné dni a hodiny
- zber čísiel zo zastaraných .sk webov (až po súhlase so spracovaním)
- živý hovor cez Twilio (Gather + ChatGPT) alebo **Zadarma + ChatGPT Live** na VPS
- skutočné MP3 nahrávky hovorov (Vercel Blob) a prepis v CRM
- história hovorov: hľadanie, štatistiky, CSV, ručná oprava úspešnosti
- follow-up úlohy sa po termíne vracajú do fronty
- import CSV
- cron + reťazenie hovorov bez zásahu človeka

## Prihlásenie

Predvolený účet po seede:

- e-mail: `admin@callbot.local`
- heslo: `INITIAL_ADMIN_PASSWORD` na Verceli — po prvom prihlásení ho zmeň v Nastaveniach

## Premenné prostredia

Pozri `.env.example`. Povinné:

- `DATABASE_URL` — Neon (doplní Vercel integrácia)
- `AUTH_SECRET`
- `CRON_SECRET`
- `APP_URL` — produkčná URL (musí sedieť s Twilio webhookmi)

Voliteľné: `TWILIO_*`, `OPENAI_API_KEY`, `ZADARMA_*`, `BRIDGE_SERVER_URL`, `BLOB_READ_WRITE_TOKEN`.

Webhook Zadarma: `https://callbot-crm.vercel.app/api/zadarma/call-status` (v Zadarma zapnite PBX notifikácie). Živý audio most beží v `/bridge-server` na VPS.

## Git a návraty

Každý funkčný stav je na `main`. Pri nepodarenej pokročilej verzii sa vráť commitom späť — história ostane na GitHub.

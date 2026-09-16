# CallBot bridge — Zadarma + OpenAI Realtime

Samostatný Node.js server pre VPS. Asterisk drží SIP trunk na Zadarmu, Node mostí ulaw audio do OpenAI Realtime API a po hovore nahrá MP3 na Vercel Blob.

Zadarma tu nie je poskytovateľ reči — len telefónna linka.

## Čo beží

1. Odchádzajúci hovor: CRM zavolá `POST /call { to, callId }`.
2. Asterisk ARI originate cez PJSIP trunk `sip.zadarma.com` (ak zlyhá, fallback na Zadarma callback API).
3. Po spojení ARI `externalMedia` (ulaw 8 kHz UDP/RTP) ↔ OpenAI Realtime (`audio/pcmu`).
4. Počas hovoru sa mixuje hlas zákazníka aj AI do WAV/MP3.
5. Po ukončení: upload na Vercel Blob a `POST {APP_URL}/api/zadarma/transcript`.

Prichádzajúci hovor z Zadarmy ide do dialplanu `from-zadarma` → Stasis `callbot` → ten istý most.

## VPS (Linux, verejná IP)

Otvorte UDP 5060, UDP 10000–20000 (RTP) a TCP 8787 (len voči Vercelu / firewallať).

```bash
cd bridge-server
cp .env.example .env
# doplňte APP_URL, CRON_SECRET (rovnaký ako na Verceli), OPENAI_API_KEY,
# ZADARMA_*, ASTERISK_ARI_PASSWORD, BLOB_READ_WRITE_TOKEN
docker compose up -d --build
```

`network_mode: host` je zámer — SIP/RTP cez Docker NAT na VPS nespoľahlivo. Na macOS/Windows Docker toto nepoužívajte.

### Bez Dockeru

1. Nainštalujte Asterisk 18+ s PJSIP a ARI, skopírujte súbory z `asterisk/` do `/etc/asterisk` a doplňte SIP údaje.
2. `npm install && npm run build && npm start`
3. `ffmpeg` musí byť v PATH kvôli MP3.

## Napojenie na CRM

V CallBot CRM (Nastavenia):

- poskytovateľ **Zadarma — ChatGPT Live**
- Bridge server URL: `http://VPS_IP:8787`
- Zadarma API kľúč/secret a SIP číslo

Na Verceli:

- `CRON_SECRET` musí sedieť s bridge `.env`
- `BRIDGE_SERVER_URL`
- `BLOB_READ_WRITE_TOKEN` (Vercel Storage → Blob)
- voliteľne `ZADARMA_*`

V Zadarma účte (Settings → Integrations and API) zapnite PBX notifikácie na:

`https://<vasa-app>.vercel.app/api/zadarma/call-status`

SIP trunk: [Zadarma myPBX](https://zadarma.com/en/support/instructions/mypbx/) — server `sip.zadarma.com`, číslo a heslo zo SIP účtu.

## Endpointy

| Metóda | Cesta | Účel |
| --- | --- | --- |
| GET | `/health` | liveness |
| POST | `/call` | odchádzajúci hovor `{ to, callId }`, Bearer `CRON_SECRET` |

## OpenAI

Bridge používa aktuálne Realtime GA (`wss://api.openai.com/v1/realtime`, formát `audio/pcmu` = G.711 μ-law). Inštrukcie a hlas berie z CRM (`/api/bridge/context`), ktoré volá existujúce `loadPlaybookIntoRealtime`.

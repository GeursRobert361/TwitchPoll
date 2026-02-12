# Twitch Poll Overlay

Realtime Twitch poll webapp (zoals poll.ma.pe) met owner dashboard, OBS overlay en mod access zonder Twitch-login.

## Stack

- Optie A: **Next.js fullstack** (App Router + API routes + custom Socket.IO server)
- Backend runtime: Node.js + Express + Socket.IO + Twitch IRC WebSocket
- ORM: Prisma
- Databases:
  - Dev: SQLite (`prisma/schema.prisma`)
  - Prod: Postgres (`prisma-postgres/schema.prisma`)
- Tests: Vitest

## Features

- Twitch OAuth Authorization Code flow voor streamer login
- Workspace/channel bevestiging na login
- Poll lifecycle: `DRAFT -> LIVE -> ENDED`
- Vote parsing uit Twitch chat (`1`, `A`, `!vote 2`, `!vote keyword`)
- Duplicate policy: `FIRST` of `LATEST`
- Anti-spam throttle: max 1 vote-update per user per seconde
- Optionele bot/blacklist filtering
- OBS overlay via unieke URL: `/o/{overlaySlug}`
- Realtime updates via Socket.IO events:
  - `poll:state`
  - `poll:update`
  - `vote:received`
- Mod invites zonder Twitch-login (one-time token, gehashed in DB)
- Mod permissions: polls beheren, geen ownership/account acties
- Demo mode met mock chat feed (geen Twitch credentials nodig)

## Project structure

```txt
.
+- server.ts
+- prisma/
¦  +- schema.prisma
¦  +- migrations/
+- prisma-postgres/
¦  +- schema.prisma
¦  +- migrations/
+- src/
¦  +- app/
¦  ¦  +- dashboard/
¦  ¦  +- mod/
¦  ¦  +- o/[overlayId]/
¦  ¦  +- api/
¦  +- components/
¦  +- lib/
¦  +- server/
¦  +- types/
+- tests/
```

## Environment

Kopieer `.env.example` naar `.env`.

```env
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
BASE_URL=http://localhost:3000
SESSION_SECRET=please_change_this_secret
DATABASE_URL=file:./dev.db
DEMO_MODE=true
PORT=3000
```

## Local development

1. Installeer dependencies:

```bash
npm install
```

2. Draai SQLite migrations:

```bash
npm run db:dev
```

3. Start development server:

```bash
npm run dev
```

4. Open:

- Home: `http://localhost:3000`
- Owner dashboard: `http://localhost:3000/dashboard`
- Mod dashboard: `http://localhost:3000/mod`

In `DEMO_MODE=true`: na klikken op **Enter Demo Mode** wordt automatisch een live voorbeeldpoll aangemaakt als er nog geen live poll bestaat.

## Twitch OAuth setup

In Twitch Developer Console:

- OAuth Redirect URL: `http://localhost:3000/api/auth/twitch/callback`
- Gebruik Authorization Code flow
- Scopes: minimaal (de app gebruikt geen extra scopes)

Zet `DEMO_MODE=false` en configureer `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET`.

## OBS overlay

1. Maak een poll in dashboard.
2. Start poll.
3. Kopieer overlay URL uit dashboard (`/o/{overlaySlug}`).
4. Voeg toe in OBS als Browser Source.

Overlay query params:

- `theme=dark|light`
- `hideVotes=true|false`
- `animate=true|false`
- `showTimer=true|false`
- `showLastVoters=true|false`
- `showNoPoll=true|false`
- `showModeHint=true|false`
- `noPollText=Your%20custom%20text`
- `bgTransparency=0..100`

Voorbeeld:

```txt
http://localhost:3000/o/abc123xyz890?theme=dark&hideVotes=false&animate=true
```

## Mod invite flow

Owner dashboard:

1. Maak invite (default expiry 7 dagen).
2. Deel invite URL met mod.
3. Mod opent `/mod/redeem?token=...` en kiest display name.
4. Mod krijgt eigen sessie-cookie (geen Twitch login nodig).
5. Owner kan mod revoke’en.

Security details:

- Invite token random 32 bytes
- Alleen hash wordt opgeslagen (`sha256`)
- Invite is single-use + expiry + revokebaar
- Mod access wordt bij elke request gevalideerd op `revokedAt`

## Tests

```bash
npm run test
```

Gedekt:

- Vote parser rules
- Poll state machine transitions

## Production (Docker Compose)

```bash
docker compose up --build
```

Services:

- `postgres` (port 5432)
- `app` (port 3000)

De container gebruikt Postgres Prisma schema/migrations (`prisma-postgres`).

## Notes

- Chat reading gebruikt Twitch IRC WebSocket (`wss://irc-ws.chat.twitch.tv:443`) met auto-reconnect + exponential backoff.
- In demo mode draait een mock vote feed die live polls automatisch van stemmen voorziet.
- Deze repo gebruikt `distDir: .next-build-out` in Next config.


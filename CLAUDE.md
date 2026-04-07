# Yogamuri Slack Bot

Slack bot that automates yoga class announcements and attendance tracking for a team yoga group ("요가무리"). Posts scheduled class notifications to Slack and lets users register/cancel attendance via interactive buttons, with records stored in Google Sheets.

## Tech Stack

- **Runtime**: Node.js 20 (CommonJS)
- **Slack**: `@slack/bolt` in Socket Mode with slash commands, App Home, modals, and interactive buttons
- **Admin UI**: built-in Node HTTP server serving a plain HTML/CSS/JS schedule page
- **Google Sheets**: `googleapis` with service account auth for attendance storage
- **Scheduling**: `node-cron` with persisted schedule rows and per-row timezone/target
- **Persistence**: `./config/schedules.seed.json` for git-tracked default schedules and `/app/data/*.json` for live runtime state in Docker
- **Config**: `dotenv` for secrets and runtime configuration

## Project Structure

```
index.js              — Main runtime wiring for Slack, cron, Sheets, and admin HTTP server
src/                  — Schedule store, admin routes, Slack views, attendance helpers, registry
test/                 — Node test runner coverage for store, routes, registry, and Slack UI helpers
package.json          — Dependencies and scripts
.env.example          — Required environment variables template
Dockerfile            — Production container (node:20-slim, non-root)
docker-compose.yml    — Single-service compose with localhost-only admin port binding and a named Docker volume for runtime state
docs/                 — Deployment documentation
```

## Core Modules

| Module                    | Purpose                                                                      |
|---------------------------|------------------------------------------------------------------------------|
| `src/schedule-store.js`   | Persists schedules, validates weekly-vs-cron XOR input, sorts enabled first   |
| `src/schedule-registry.js`| Registers enabled cron jobs and re-syncs them on create/toggle               |
| `src/admin-server.js`     | Serves `/admin` and authenticated JSON APIs for create/list/toggle           |
| `src/slack-admin.js`      | Builds App Home, admin modal, weekly-or-cron add modal, and test picker views |
| `src/attendance-service.js` | Reads/writes Google Sheets and auto-adds `scheduleId` / `jobName` columns |
| `src/announcement-store.js` | Tracks live announcement messages by `scheduleId + occurrenceDate`         |

## User Flow

```
Admin page / Slack modal / App Home
        │
        ▼
  Create or toggle saved schedule rows
        │
        ▼
  `node-cron` registry updates immediately
        │
        ▼
  Scheduled or manual announcement posts to Slack
        │
        ▼
  Users register attendance via buttons
        │
        ▼
  Attendance is stored in Google Sheets with `scheduleId + date + userId`
```

## Commands

```
npm install        — Install dependencies
npm run dev        — Run with TLS verification disabled (development)
npm start          — Run in production mode
```

### Slack Slash Commands

| Command                       | Description                                          |
|-------------------------------|------------------------------------------------------|
| `/yoga open <time> <class>`   | Post class announcement to channel immediately       |
| `/yoga test`                  | Pick a saved schedule and send it to the test channel |
| `/yoga schedule`              | Open the schedule admin modal (allowlisted users)     |

## Environment Variables

See `.env.example` for the full list. Key variables:
- `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` — Slack credentials
- `SLACK_CHANNEL_ID` / `SLACK_TEST_CHANNEL_ID` — Production and test announcement channels
- `ADMIN_PASSWORD` — Password for `/admin`
- `ADMIN_UI_PORT` — Port for the built-in admin page
- `SCHEDULE_ADMIN_USER_IDS` — Comma-separated Slack admin allowlist
- `SCHEDULE_STORE_PATH` — Persisted runtime schedule JSON file
- `SCHEDULE_SEED_PATH` — Git-tracked default schedule seed file
- `GOOGLE_SHEETS_ID` — Spreadsheet for attendance records
- `GOOGLE_SERVICE_ACCOUNT_KEY` or `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` — Google auth
- `SCHEDULE_TZ` — Timezone (default: `Asia/Seoul`)

## Deployment

Dockerized single-service deployment. See `docs/docker-deploy.md` for details.

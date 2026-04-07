# Yogamuri Slack Bot

Slack bot that automates yoga class announcements and attendance tracking for a team yoga group ("요가무리"). Posts scheduled class notifications to Slack and lets users register/cancel attendance via interactive buttons, with records stored in Google Sheets.

## Tech Stack

- **Runtime**: Node.js 20 (CommonJS)
- **Slack**: `@slack/bolt` in Socket Mode (no public HTTP endpoint needed)
- **Google Sheets**: `googleapis` with service account auth for attendance storage
- **Scheduling**: `node-cron` for automatic daily announcements
- **Config**: `dotenv` for secrets, `yoga-schedule.json` for class timetable

## Project Structure

```
index.js              — Entire bot logic (single-file application)
yoga-schedule.json    — Weekly class schedule config (days, times, locations, channels)
package.json          — Dependencies and scripts
.env.example          — Required environment variables template
Dockerfile            — Production container (node:20-slim, non-root)
docker-compose.yml    — Single-service compose with auto-restart
docs/                 — Deployment documentation
```

## Key Sections in index.js

| Section                  | Lines   | Purpose                                                        |
|--------------------------|---------|----------------------------------------------------------------|
| Slack App init           | 8-12    | `@slack/bolt` app in Socket Mode                               |
| Config & env             | 14-18   | Reads timezone, channel, Sheets ID, schedule path from env     |
| Google Auth              | 20-38   | Loads service account creds (JSON, base64, or file)            |
| Date/time helpers        | 40-71   | Formatting for sheet operations                                |
| Header mapping           | 73-98   | Maps sheet columns by English/Korean aliases for flexibility   |
| Sheets client            | 100-107 | Authenticated Google Sheets API client                         |
| Append attendance        | 109-172 | Upserts attendance row by date + userId                        |
| Delete attendance        | 174-230 | Removes attendance row on cancel                               |
| Slack Block builders     | 232-321 | Block Kit UI (interest, attend, late, cancel buttons)          |
| Schedule config loader   | 323-336 | Reads yoga-schedule.json, picks today's message                |
| `/yoga` slash command    | 338-402 | `open` (post announcement) and `test` (test channel) commands  |
| Button action handlers   | 404-476 | Handles interest, attend, late, cancel button interactions     |
| Cron scheduler           | 478-513 | Auto-posts announcements at configured cron time               |

## User Flow

```
Cron (9AM Mon/Tue/Thu)  ──or──  /yoga open command
        │                              │
        ▼                              ▼
  Post class announcement to Slack channel
        │
        ▼
  User clicks "저요!" (I'm in!)
        │
        ▼
  Ephemeral: "참석" (Attend) or "늦참" (Late)
        │
        ▼
  Record written to Google Sheet  ←──  "취소" (Cancel) deletes it
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
| `/yoga test [day]`            | Send test message to test channel (defaults to today) |

## Environment Variables

See `.env.example` for the full list. Key variables:
- `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` — Slack credentials
- `SLACK_CHANNEL_ID` — Target channel for announcements
- `GOOGLE_SHEETS_ID` — Spreadsheet for attendance records
- `GOOGLE_SERVICE_ACCOUNT_KEY` or `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` — Google auth
- `SCHEDULE_TZ` — Timezone (default: `Asia/Seoul`)

## Deployment

Dockerized single-service deployment. See `docs/docker-deploy.md` for details.

# Work Logging

Standalone daily productivity & time-tracking app.

## Features

- User accounts with signup/login
- Work & Ilme Deen timers
- Daily plans, tasks, priorities, and notes
- Multi-person profiles, task templates, daily goals
- Streaks and weekly charts
- Admin panel at `/admin` (password-protected)

## Quick start

```bash
pnpm install
cp .env.example .env.local
# Add your MongoDB URI and secrets to .env.local
pnpm dev
```

Runs on **http://localhost:3001** by default.

## Environment

Copy `.env.example` to `.env.local` and fill in your values.

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | Your MongoDB connection string |
| `MONGODB_DB_NAME` | No | Database name (default: `worklog`) |
| `WORKLOG_SESSION_SECRET` | Prod | JWT secret for user sessions |
| `ADMIN_PASSWORD` | Prod | Admin login password |
| `ADMIN_SESSION_SECRET` | Prod | JWT secret for admin sessions |

## API routes

| Route | Description |
|-------|-------------|
| `POST /api/auth/signup` | Create account |
| `POST /api/auth/login` | Sign in |
| `POST /api/auth/logout` | Sign out |
| `GET /api/auth/me` | Current user |
| `GET/PATCH/DELETE /api/work-log/[date]` | Day entries |
| `GET/PATCH /api/work-log/settings` | Profiles & templates |
| `GET/PATCH/DELETE /api/admin/work-log/[date]` | Admin day entries |
| `GET/PATCH /api/admin/work-log/settings` | Admin settings |

## Deploy

This app is independent — deploy it to its own host (Vercel, Railway, etc.) with its own MongoDB database.

If you link to it from another site, set that site's `NEXT_PUBLIC_WORKLOG_APP_URL` to this app's public URL.

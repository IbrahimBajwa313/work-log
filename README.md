# Work Logging

Standalone daily productivity & time-tracking app.

## Features

- User accounts with signup/login (email/password or Google)
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
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID (enables Google sign-in) |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | No | Override callback URL (default: `{origin}/api/auth/google/callback`) |
| `ADMIN_PASSWORD` | Prod | Admin login password |
| `ADMIN_SESSION_SECRET` | Prod | JWT secret for admin sessions |

## API routes

| Route | Description |
|-------|-------------|
| `POST /api/auth/signup` | Create account |
| `POST /api/auth/login` | Sign in |
| `GET /api/auth/google` | Start Google OAuth |
| `GET /api/auth/google/callback` | Google OAuth callback |
| `GET /api/auth/google/status` | Whether Google sign-in is configured |
| `POST /api/auth/logout` | Sign out |
| `GET /api/auth/me` | Current user |
| `GET/PATCH/DELETE /api/work-log/[date]` | Day entries |
| `GET/PATCH /api/work-log/settings` | Profiles & templates |
| `GET/PATCH/DELETE /api/admin/work-log/[date]` | Admin day entries |
| `GET/PATCH /api/admin/work-log/settings` | Admin settings |

## Deploy

This app is independent — deploy it to its own host (Vercel, Railway, etc.) with its own MongoDB database.

If you link to it from another site, set that site's `NEXT_PUBLIC_WORKLOG_APP_URL` to this app's public URL.

## Google sign-in setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add authorized redirect URIs:
   - Local: `http://localhost:3001/api/auth/google/callback`
   - Production: `https://your-domain.com/api/auth/google/callback`
4. Copy the client ID and secret into `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Restart the dev server. The login screen will show **Continue with Google**.

Google accounts are stored in the same `worklogAccounts` collection. If someone already signed up with email/password, signing in with Google on the same email links the Google account automatically.

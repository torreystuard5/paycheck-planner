# Deploying PayDrift

## Render

### Backend Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | Random secret for JWT signing |
| `ALGORITHM` | JWT algorithm (default `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token TTL in minutes |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token TTL in days |
| `SUPPORT_EMAIL` | Support contact email |
| `FRONTEND_URL` | Frontend origin for CORS |

#### Database URL

On Render, use the **Internal Database URL** and ensure it is in the form `postgresql+asyncpg://...`. If Render gives you `postgresql://...`, just add `+asyncpg` after `postgresql`.

The app automatically normalizes `postgres://` and `postgresql://` URLs to `postgresql+asyncpg://` at startup, so Render's default connection string will work without manual changes.

### Run Migrations (First Deploy)

After first deploy, go to Render → Shell for the backend service and run:

```bash
python migrate.py
```

This will create all tables on the Render Postgres instance.
Subsequent deploys will run migrations automatically via start.sh.

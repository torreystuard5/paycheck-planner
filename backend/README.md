# PayDrift Backend

FastAPI backend for PayDrift — paycheck-based financial planning.

## Environment Variables

### Support Email Notifications

Configure these environment variables to enable email notifications when support tickets are created. If not set, the system falls back to the general SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`).

| Variable | Description | Default |
|---|---|---|
| `SUPPORT_SMTP_HOST` | SMTP server hostname for support emails | Falls back to `SMTP_HOST` |
| `SUPPORT_SMTP_PORT` | SMTP server port | Falls back to `SMTP_PORT` |
| `SUPPORT_SMTP_USER` | SMTP username / sender address | Falls back to `SMTP_USER` |
| `SUPPORT_SMTP_PASSWORD` | SMTP password or app-specific password | Falls back to `SMTP_PASSWORD` |
| `SUPPORT_NOTIFICATION_EMAIL` | Recipient address for support ticket notifications | Falls back to `SUPPORT_EMAIL` |

If neither the support-specific nor the general SMTP credentials are configured, email sending is silently disabled and ticket creation still succeeds.

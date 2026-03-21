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

### Refer-a-Friend Program

PayDrift includes a referral program that rewards both the referrer and the referred user with free months of service during a configurable promotional window.

**How it works:**

1. Every user gets a unique referral code on registration.
2. Users share their referral link (`/register?ref=CODE`) with friends.
3. When a referred user signs up, a pending `ReferralReward` is created.
4. When the referred user activates a paid plan (via `POST /api/v1/billing/activate-plan`), rewards are applied:
   - The referred user gets their first month free (next_billing_date extended by 30 days).
   - The referrer earns +1 free_month_credits.
5. Rewards are only applied while the promo window is active.

| Variable | Description | Default |
|---|---|---|
| `REFERRAL_PROMO_START` | Start date for the referral promo (ISO format, e.g. `2026-03-21`) | Not set (promo inactive) |
| `REFERRAL_PROMO_END` | End date for the referral promo (ISO format, e.g. `2026-06-21`) | Not set (promo inactive) |

If neither variable is set, the referral promo is inactive and no rewards are applied on plan activation. Referral codes and tracking still work — rewards simply stay in "pending" status until the promo is activated.

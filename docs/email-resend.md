# Event Scout transactional email (Resend)

All branded mail shares one white template: centered ICON mark, gold “Event Scout” wordmark, shimmer accent line, short copy, gold pill CTA. Sent from **Event Scout** via the shared Project ICON Resend account.

## Email inventory

### Auth & access (4)

| Email | When | Who |
| --- | --- | --- |
| **Confirm email** | Email/password signup | New user |
| **Invitation** | Admin → Send invitation | Invitee |
| **Password reset** | Forgot password / security verify link | Account holder |
| **Access request alert** | `/request-access` submitted | `admin@projecticon.io` |

### Billing & trial (3)

| Email | When | Who |
| --- | --- | --- |
| **Trial complete** | Free discovery search finishes (trial is usage-based, not calendar) | Trial user |
| **Payment confirmed** | Stripe `invoice.paid` (PDF attached when Stripe provides one) | Subscriber |
| **Credits topped up** | Stripe Checkout top-up completed | Customer |

**Total: 7** live via Resend.

## Addressing

- **From:** `Event Scout <support@mail.projecticon.io>`
- **Reply-To:** `admin@projecticon.io` (access-request alerts Reply-To the requester)
- Logo attached inline (`cid:`)

```bash
RESEND_API_KEY=re_...
RESEND_FROM="Event Scout <support@mail.projecticon.io>"
RESEND_REPLY_TO=admin@projecticon.io
RESEND_OWNER_EMAIL=admin@projecticon.io
NEXT_PUBLIC_APP_URL=https://your-production-host
```

## Code map

- Templates: `src/lib/email/templates.ts`
- Send + attachments: `src/lib/email/resend.ts`
- Billing/trial helpers: `src/lib/email/notify.ts`
- Auth routes: `/api/auth/send-verification`, `/api/auth/send-password-reset`
- Stripe: `/api/stripe/webhook` (`invoice.paid`, top-up `checkout.session.completed`)
- Trial: after discovery completes in `src/lib/discovery.ts`

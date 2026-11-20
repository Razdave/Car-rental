# Going live on Supabase

The app runs in **demo mode** (everything stored on the device) until the two `VITE_SUPABASE_*` variables are set.
These steps switch it to the real backend in `supabase/`.

## 1. Create the project and database

1. Create a project at supabase.com (region: closest to your customers, e.g. `eu-west-2` for Lagos).
2. Install the CLI and link it: `npx supabase login` then `npx supabase link --project-ref <ref>`.
3. Push the schema: `npx supabase db push` (runs everything in `supabase/migrations/`).
4. Load the starter fleet once: run `supabase/seed.sql` in the SQL editor (or `npx supabase db reset` locally).
   Regenerate it from `src/data/cars.ts` with `npm run seed:generate`.
5. Check: **Database → Extensions** shows `btree_gist`, `pgcrypto`, `pg_cron` and `pg_net` enabled.

Run `npm run test:db` any time to replay every migration in an in-memory Postgres and walk a booking through its whole lifecycle.

## 2. Auth

- **Authentication → Providers → Email**: enabled, "Confirm email" on.
- **Authentication → Email templates → Magic Link**: include the code, e.g. `Your Aurevon code is {{ .Token }}`.
  The sign-in screen asks for this 6-digit code.
- **Authentication → URL configuration**: Site URL = your domain; add `http://localhost:3000` for development.
- Make yourself an admin after your first sign-in:
  ```sql
  update public.profiles set role = 'admin' where email = 'you@your-domain.example';
  ```
  Admins can then promote staff in SQL (`role = 'staff'` or `'manager'`). Staff see the dashboard at `/admin`.

## 3. Edge Functions and secrets

```bash
npx supabase secrets set SITE_URL=https://your-domain.example \
  ALLOWED_ORIGINS=https://your-domain.example,http://localhost:3000 \
  PAYSTACK_SECRET_KEY=sk_test_xxx \
  RESEND_API_KEY=re_xxx NOTIFY_FROM_EMAIL="Aurevon <bookings@your-domain.example>" \
  TERMII_API_KEY=xxx TERMII_SENDER_ID=Aurevon \
  VAPID_PUBLIC_KEY=xxx VAPID_PRIVATE_KEY=xxx VAPID_SUBJECT=mailto:support@your-domain.example \
  CRON_SECRET=$(openssl rand -hex 32)

npx supabase functions deploy payments-init
npx supabase functions deploy payments-verify
npx supabase functions deploy payments-webhook --no-verify-jwt
npx supabase functions deploy send-notification --no-verify-jwt
npx supabase functions deploy deposits-settle
```

Generate VAPID keys with `npx web-push generate-vapid-keys`.

Tell the database where to send queued messages (the cron job calls the function every minute):

```sql
insert into public.app_settings (key, value) values
  ('functions_url', 'https://<ref>.supabase.co/functions/v1'),
  ('cron_secret',   '<the same CRON_SECRET>'),
  ('ops_email',     'ops@your-domain.example')      -- staff alerts for new bookings, failed payments, overdue returns
on conflict (key) do update set value = excluded.value;
```

## 4. Paystack

- Dashboard → **Settings → API keys & webhooks**: set the webhook URL to
  `https://<ref>.supabase.co/functions/v1/payments-webhook`.
- Use test keys until you've done a full booking; switch `PAYSTACK_SECRET_KEY` to the live key to go live.
- Customers are redirected to Paystack's hosted checkout (card, bank transfer, USSD) and back to their booking.
  Payments are confirmed server-side, and the amount is checked against the booking before it's marked paid.

## 5. The web app

Set these where you host the front end (Vercel → Project → Settings → Environment Variables), then redeploy:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
VITE_VAPID_PUBLIC_KEY=<VAPID public key>
```

Add an SPA rewrite so deep links work (Vercel: `vercel.json` with `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`).

## What runs automatically

| When | What happens |
| --- | --- |
| Booking created | Price calculated server-side; overlapping bookings refused by the database; "booking received" email; staff alert |
| Paid (Paystack) | Receipt email; status visible to staff instantly |
| Not paid within 30 min | Booking released so the car is bookable again; customer told by email + SMS |
| Staff confirm / decline | Confirmation email (with calendar invite) + SMS, or decline reason in chat |
| 24 h and 2 h before pick-up | Reminders (and a nudge to sign the agreement if unsigned) |
| Trip start | Requires a signed agreement and payment |
| 2 h before return / overdue | SMS reminder / overdue alert to customer and staff |
| Staff reply in Inbox | Push notification to the customer's devices |
| Any booking, block or listing change | Live availability updates on every open screen (Realtime) |

## Customer screening and deposits

- Customers submit their licence (both sides), government ID, a selfie, employment or company details and a 5-year driving-record declaration at `/verify`. Files go to the private `verification-docs` bucket in a folder named after the user; only the customer and staff can read them, and staff viewing them is written to `audit_log`.
- Staff review each check in **/admin → Verification**. A customer is verified only when every check is approved, they are 25+, and the licence/ID are in date. Bookings can be requested while verification is in review but can't be **confirmed** until the customer is verified. Verification expires automatically (daily job) when the licence or ID lapses.
- Each car has a refundable security deposit (category default, or set per car in the listing editor). It is a separate Paystack charge paid from the booking page, because Paystack card pre-authorisation requires merchant approval — if you get it enabled, the deposit flow can switch to a hold. A trip can't start until the deposit is held. After return, staff release it in full or keep part with a written reason; `deposits-settle` refunds the rest through Paystack.
- Checks are manual for now. To automate licence/NIN lookups and face matching, plug a Nigerian KYC provider (e.g. Smile ID, Prembly/IdentityPass, Dojah, VerifyMe) into a new Edge Function that pre-fills the check decisions for staff.
- Data protection (NDPA 2023): tell customers why you collect each document (shown on the form), keep documents only as long as needed (e.g. delete 12 months after the last rental), and give staff access only to those who need it.

## Before launch

- Have the rental agreement in `src/lib/agreement.ts` reviewed by a lawyer for your market (bump `AGREEMENT_VERSION` when it changes).
- Replace the US sample locations in `src/data/cars.ts` / `public.locations` with your real hubs.
- Refunds aren't automatic: refund in the Paystack dashboard, then mark the booking refunded (staff dashboard or `set_payment_status`).

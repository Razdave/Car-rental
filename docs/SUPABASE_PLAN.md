# Backend plan: moving to Supabase

Status: **implemented** in `supabase/` (migrations, functions, seed) and wired into the app through
[`src/lib/backend/`](../src/lib/backend/). Setup steps: [SUPABASE_SETUP.md](SUPABASE_SETUP.md). The sections below are the original design notes.

## 0. Requirements coverage

The rental management system must support the five capabilities below.

| Requirement | Today | With this plan |
| --- | --- | --- |
| **Online bookings** | Customer flow built end to end (search → car → trip details → checkout → confirmation). Saved by the Express API, or on the device when it's offline. | `create_booking` RPC prices the booking on the server; the `no_overlap` constraint blocks double-bookings (§2, §4). |
| **Payment processing** | Demo checkout only — no money is taken. | Paystack via `payments-init` + `payments-webhook` Edge Functions; unpaid bookings auto-expire (§5). |
| **Fleet availability tracking** | `is_available` flag and an overlap check in the Express API; GPS webhook stores positions. No staff UI. | Availability = `is_available` **and** no overlapping open booking, queried by date range; Realtime updates; staff dashboard with fleet calendar and GPS map (§2, §9, §12). |
| **Automated confirmations** | None — the app only polls status. | Email + SMS on every booking status change and payment, plus pick-up/return reminders (§11). |
| **Customer data management** | Profile kept in the browser only. | `profiles` with Supabase Auth, licence upload and verification, booking history, staff customer view, data export/deletion (§3, §6, §13). |

## 1. What we're replacing

The current Express + SQLite API (`server/index.ts`) does five things. Each maps onto a Supabase feature:

| Today (Express) | Supabase |
| --- | --- |
| `staff` table, scrypt passwords, bearer sessions | **Supabase Auth** (customers *and* staff) + a `profiles.role` column |
| `cars`, `bookings` as JSON blobs in SQLite | **Postgres** tables with real columns, constraints and **RLS** |
| Price calculation + overlap check in `POST /api/bookings` | **`create_booking` Postgres function** (RPC) + an exclusion constraint |
| Image upload to `data/car-images` | **Storage** bucket `car-images` |
| GPS webhook | **Edge Function** `gps-webhook` (shared secret) |
| Customer status polling every 15s | **Realtime** subscription on the customer's own bookings |
| `activity_logs` | Postgres trigger writing to `audit_log` |

## 2. Schema (first migration)

```sql
create extension if not exists btree_gist;

create type user_role       as enum ('customer', 'staff', 'manager', 'admin');
create type booking_status  as enum ('pending', 'confirmed', 'active', 'completed', 'cancelled');
create type duration_unit   as enum ('day', 'hour');
create type car_category    as enum ('Sports', 'SUV', 'Electric', 'Luxury', 'Sedan');

-- One row per auth user. Created by trigger on auth.users insert.
create table profiles (
  id             uuid primary key references auth.users on delete cascade,
  full_name      text not null default '',
  phone          text,
  licence_number text,
  licence_expiry date,
  licence_verified_at timestamptz,          -- set by staff after document check
  role           user_role not null default 'customer',
  created_at     timestamptz not null default now()
);

create table locations (
  id    text primary key,                    -- 'loc-1'
  name  text not null,
  city  text not null,
  kind  text not null default 'hub',         -- hub | airport | marina
  active boolean not null default true
);

create table cars (
  id              text primary key,          -- keep 'car-audi-r8' style slugs: they're in shared URLs
  name            text not null,
  brand           text not null,
  model           text not null,
  year            int  not null,
  category        car_category not null,
  price_per_day   int  not null check (price_per_day > 0),   -- kobo-free whole naira, as today
  price_per_hour  int  not null check (price_per_hour > 0),
  power_hp        int, acceleration_0_100 numeric(3,1), top_speed_kmh int,
  transmission    text not null check (transmission in ('Automatic','Manual')),
  fuel_type       text not null check (fuel_type in ('Petrol','Electric','Hybrid','Diesel')),
  seats           int  not null, doors int not null,
  color           text, description text, features text[] not null default '{}',
  image_path      text not null,              -- Storage path, not a URL
  gallery_paths   text[] not null default '{}',
  home_location_id text references locations,
  mileage_limit   text,
  is_available    boolean not null default true,
  is_popular      boolean not null default false,
  is_featured     boolean not null default false,
  rating          numeric(3,2) not null default 5, review_count int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table extra_services (
  id            text primary key,             -- 'insurance-full'
  name          text not null,
  description   text not null,
  price_per_day int  not null check (price_per_day >= 0),
  icon          text not null,
  default_selected boolean not null default false,
  active        boolean not null default true
);

create table promo_codes (
  code        text primary key,               -- 'DRIVE20'
  kind        text not null check (kind in ('percent','fixed')),
  value       int  not null,                  -- 20 (%) or 50000 (₦)
  valid_from  timestamptz, valid_to timestamptz,
  max_uses    int, uses int not null default 0,
  active      boolean not null default true
);

create table bookings (
  id               text primary key default 'BK-' || upper(substr(gen_random_uuid()::text, 1, 8)),
  customer_id      uuid not null references profiles,
  car_id           text not null references cars,
  pickup_at        timestamptz not null,
  return_at        timestamptz not null check (return_at > pickup_at),
  pickup_location_id text not null references locations,
  return_location_id text not null references locations,
  duration_unit    duration_unit not null,
  duration_value   int not null,
  -- price snapshot (never recomputed after creation)
  unit_price int not null, base_price int not null, extras_total int not null,
  tax_amount int not null, discount int not null default 0, total_amount int not null,
  promo_code       text references promo_codes,
  driver           jsonb not null,            -- {fullName,email,phone,licenceNumber,ageConfirmed}
  car_snapshot     jsonb not null,            -- name/image at time of booking, for history
  status           booking_status not null default 'pending',
  payment_status   text not null default 'unpaid' check (payment_status in ('unpaid','authorized','paid','refunded','failed')),
  payment_ref      text,                      -- Paystack reference
  pass_code        text not null default 'PASS-' || upper(substr(gen_random_uuid()::text, 1, 6)),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),

  -- The database itself refuses double-bookings — no race between check and insert.
  constraint no_overlap exclude using gist (
    car_id with =, tstzrange(pickup_at, return_at) with &&
  ) where (status in ('pending','confirmed','active'))
);

create table booking_extras (
  booking_id text references bookings on delete cascade,
  service_id text references extra_services,
  price_per_day int not null,
  primary key (booking_id, service_id)
);

create table favorites (
  user_id uuid references profiles on delete cascade,
  car_id  text references cars on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, car_id)
);

create table car_positions (
  id bigint generated always as identity primary key,
  car_id text not null references cars on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  recorded_at timestamptz not null, provider text, received_at timestamptz not null default now()
);
create index on car_positions (car_id, recorded_at desc);

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles, action text not null,
  resource_type text not null, resource_id text, details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

Seed `cars`, `locations`, `extra_services` and `promo_codes` from `src/data/cars.ts` (a one-off script).

## 3. Row-level security

Helper: `create function is_staff() returns boolean ... select role in ('staff','manager','admin') from profiles where id = auth.uid()`.

| Table | Customer | Staff | Manager / admin |
| --- | --- | --- | --- |
| `cars`, `locations`, `extra_services` | read where `is_available`/`active` (anon too) | read all, update `is_available` | full write |
| `promo_codes` | **no access** (validated inside `create_booking`) | read | write |
| `bookings` | read own; **no direct insert** (use RPC); update own only to `cancelled` while `pending/confirmed` and > 24h before pick-up (via `cancel_booking` RPC) | read all, status transitions | same + refunds |
| `favorites` | read/write own | — | — |
| `profiles` | read/update own (not `role`, not `licence_verified_at`) | read all | update `role` (admin only for manager/admin) |
| `car_positions` | none | read | read |
| `audit_log` | none | none | read |

Status transitions (`pending → confirmed → active → completed`, any open state → `cancelled`) are enforced in a
`set_booking_status(id, next)` function, mirroring the `transitions` map in today's server.

## 4. Booking creation (`create_booking` RPC)

`security definer` Postgres function, called with `supabase.rpc('create_booking', {...})`:

1. Require `auth.uid()`; read car (must be available), extras and promo from the database. **Never trust client prices.**
2. Compute duration/base/extras/tax/discount with the same rules as `src/lib/pricing.ts`
   (8% tax, day = calendar-day difference, hour = ceil(minutes/60), extras prorated /24 for hourly).
3. Insert the booking + `booking_extras`. The `no_overlap` constraint raises `23P01` if the car is taken; map it to a friendly error.
4. Return the row. Status starts as `pending`, `payment_status` as `unpaid`.

Add a pgTAP or SQL test that the RPC total equals `calculateQuote()` for a few fixtures, so the two copies can't drift.

## 5. Payments (decision needed)

Prices are in naira, so **Paystack** (or Flutterwave) is the natural fit, not Apple Pay/PayPal as the current demo UI shows.

Proposed flow:
1. `create_booking` → booking `pending/unpaid`.
2. Edge Function `payments-init` calls Paystack `transaction/initialize` with the booking total and returns the checkout URL / access code.
3. Paystack popup/redirect completes.
4. Edge Function `payments-webhook` verifies the signature, sets `payment_status = 'paid'` (or `authorized` if we pre-auth a deposit).
5. Staff confirm availability → `confirmed`. Unpaid bookings older than 30 min are auto-cancelled by a `pg_cron` job (frees the car).

## 6. Auth

- Customers: email OTP / magic link + Google. Phone OTP (Termii or Twilio) later if needed.
- Guest checkout: allow signing in *during* checkout (email OTP on the driver email) rather than before browsing.
- Staff: same Auth, `role` set by an admin. Bootstrap the first admin with a SQL seed, as `BOOTSTRAP_ADMIN_*` does today.
- Licence verification: upload to a private `licences` bucket (owner-only RLS), staff mark `licence_verified_at`.

## 7. Storage

- `car-images` — public read, write for manager/admin. Store paths in `cars.image_path`; build URLs with
  `getPublicUrl` and use image transforms (`?width=800`) for cards.
- `licences` — private, owner + staff read.

## 8. Front-end changes

All contained in `src/lib/`:

- Add `@supabase/supabase-js`, `src/lib/supabase.ts` (client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).
- Re-implement `fetchCars`, `createBooking`, `fetchBookingStatus` in `src/lib/api.ts`; add `fetchMyBookings`,
  `cancelBooking`, `toggleFavorite`, `fetchProfile`, `updateProfile`.
- `AppState`: replace `localStorage` for bookings/favorites/profile with these calls (keep localStorage only as a
  signed-out favorites cache, merged on sign-in). Replace the 15s status poll with a Realtime channel on `bookings`
  filtered by `customer_id`.
- Generate types with `supabase gen types typescript` and map rows → the existing `Car`/`Booking` types in one adapter.

## 9. Staff dashboard

Not built yet (the Express API has endpoints but no UI). Suggest a separate `/admin` route group in this app,
gated on `profiles.role`, covering: booking queue (confirm / start / complete / cancel), fleet availability and editing,
image upload, staff management, and a map of `car_positions`.

## 10. Migration order

1. Create project; write migrations under `supabase/migrations/` (schema → RLS → functions → seed). Use the Supabase CLI locally.
2. Implement `create_booking`, `set_booking_status`, `cancel_booking` + tests.
3. Swap `src/lib/api.ts` reads (cars) → then writes (bookings) → then auth/profile/favorites.
4. Paystack Edge Functions in test mode.
5. Automated confirmations (§11).
6. Staff dashboard, including fleet calendar and customer view.
7. Port the GPS webhook to an Edge Function; retire `server/`.

## 11. Automated confirmations

Every customer-facing event sends a message without staff doing anything.

**Mechanism:** an `after insert or update of status, payment_status` trigger on `bookings` inserts a row into a
`notifications_outbox` table. A Database Webhook calls the `send-notification` Edge Function, which renders the
template, sends it and marks the row `sent` (or `failed`, with retries). The outbox gives a delivery log and stops
duplicates if a webhook fires twice.

```sql
create table notifications_outbox (
  id bigint generated always as identity primary key,
  booking_id text references bookings on delete cascade,
  event text not null,          -- 'booking.received', 'booking.confirmed', ...
  channel text not null check (channel in ('email','sms')),
  recipient text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (booking_id, event, channel)
);
```

| Event | When | Email | SMS |
| --- | --- | --- | --- |
| Booking received | `create_booking` | ✓ summary + "awaiting confirmation" | — |
| Payment received | `payment_status → paid` | ✓ receipt | — |
| Payment failed / booking expired | webhook / `pg_cron` expiry | ✓ | ✓ |
| Booking confirmed | `pending → confirmed` | ✓ pass code + `.ics` attachment | ✓ |
| Pick-up reminder | 24 h and 2 h before `pickup_at` (`pg_cron` every 15 min) | ✓ | ✓ |
| Trip started | `confirmed → active` | ✓ return time + roadside number | — |
| Return reminder | 2 h before `return_at` | — | ✓ |
| Trip completed | `active → completed` | ✓ final receipt + review link | — |
| Cancelled / refunded | `→ cancelled`, refund webhook | ✓ | ✓ |
| Staff alert | new booking, payment failed | ✓ to the ops inbox | — |

**Providers (to confirm):** Resend or Postmark for email; Termii (Nigeria) or Twilio for SMS. WhatsApp Business can
be added later as a channel. Customers can opt out of SMS reminders in their profile (`profiles.sms_opt_in`), but
not out of transactional emails.

In the app, Realtime pushes the same status changes to the open Trips and booking-detail pages, replacing the
current 15-second poll.

## 12. Fleet availability tracking

- **Bookable** = `cars.is_available` (staff can take a car out of service) **and** no open booking overlapping the
  requested window. Expose this as `available_cars(pickup_at, return_at, location_id)` so the Explore page shows only
  cars that are actually free for the searched dates.
- **Maintenance blocks:** a `car_blocks (car_id, starts_at, ends_at, reason)` table for servicing and cleaning
  between rentals, included in the same overlap check. Optionally add an automatic buffer (for example 2 hours) after
  every return.
- **Staff views:** a fleet calendar (cars × days, showing bookings and blocks), today's pick-ups and returns, and a
  map of the latest `car_positions`.
- **Utilisation report:** booked hours ÷ available hours per car per month, from a SQL view.

## 13. Customer data management

- **Profile:** name, phone, email (from Auth), licence number and expiry, licence photo in the private `licences`
  bucket, verification status set by staff.
- **Staff customer view:** search by name, email, phone or booking ID; see bookings, payments, notes and flags
  (`customer_notes`, `blocked_at`) — managers and admins only.
- **History:** customers see all past bookings and receipts; nothing is deleted when a booking ends.
- **Privacy (Nigeria Data Protection Act 2023, or the rules of the chosen market):** consent at sign-up,
  self-service data export, and account deletion that anonymises personal data but keeps booking and payment records
  required for accounting. Licence images are deleted after an agreed retention period.
- **Access logging:** staff viewing licence documents is written to `audit_log`.

## Open questions

- **Market**: Nigeria — hubs in Calabar (default) and Lagos, prices in ₦, Lagos time. Still US in the demo data: the sample customer's phone number, the roadside-assistance number and mileage limits in miles.
- **Payment timing**: charge in full at booking, take a deposit, or pay at pick-up?
- **Cancellation**: is "free up to 24h before pick-up" the real policy, and what happens inside 24h?
- **Extensions**: should extending a trip need staff approval and an extra payment? Today it only changes the local copy.
- **Accounts**: are guest bookings allowed, or must customers sign in first?

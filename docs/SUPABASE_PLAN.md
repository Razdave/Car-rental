# Backend plan: moving to Supabase

Status: **proposal**, nothing below is implemented yet. The web app is ready for it: every network call goes through
[`src/lib/api.ts`](../src/lib/api.ts), and server-side pricing rules are mirrored in [`src/lib/pricing.ts`](../src/lib/pricing.ts).

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
5. Staff dashboard.
6. Port the GPS webhook to an Edge Function; retire `server/`.

## Open questions

- **Market**: prices are in ₦ but locations, phone formats, miles and the support number are US (Los Angeles). Which market is this for? It changes payment provider, licence format, tax rate and units.
- **Payment timing**: charge in full at booking, take a deposit, or pay at pick-up?
- **Cancellation**: is "free up to 24h before pick-up" the real policy, and what happens inside 24h?
- **Extensions**: should extending a trip need staff approval and an extra payment? Today it only changes the local copy.
- **Accounts**: are guest bookings allowed, or must customers sign in first?

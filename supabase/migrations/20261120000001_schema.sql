-- Aurevon rental management — schema
-- Business time zone: Africa/Lagos (UTC+1, no DST). Money: whole naira (int).

create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.user_role      as enum ('customer', 'staff', 'manager', 'admin');
create type public.booking_status as enum ('pending', 'confirmed', 'active', 'completed', 'cancelled');
create type public.payment_status as enum ('unpaid', 'authorized', 'paid', 'refunded', 'failed');
create type public.duration_unit  as enum ('day', 'hour');
create type public.car_category   as enum ('Sports', 'SUV', 'Electric', 'Luxury', 'Sedan');

-- ---------------------------------------------------------------- people
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text not null default '',
  email               text not null default '',
  phone               text not null default '',
  licence_number      text not null default '',
  licence_expiry      text not null default '',          -- as printed, e.g. "11/2029"
  licence_verified_at timestamptz,
  role                public.user_role not null default 'customer',
  sms_opt_in          boolean not null default true,
  notes               text not null default '',          -- staff-only
  blocked_at          timestamptz,                       -- staff-only: blocks new bookings
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------- catalogue
create table public.locations (
  id     text primary key,
  name   text not null unique,
  city   text not null,
  kind   text not null default 'hub' check (kind in ('hub', 'airport', 'marina')),
  active boolean not null default true
);

create table public.extra_services (
  id               text primary key,
  name             text not null,
  description      text not null default '',
  price_per_day    int  not null check (price_per_day >= 0),
  icon             text not null default 'Gauge',
  default_selected boolean not null default false,
  active           boolean not null default true,
  sort             int not null default 0
);

create table public.promo_codes (
  code       text primary key check (code = upper(code)),
  kind       text not null check (kind in ('percent', 'fixed')),
  value      int  not null check (value > 0),
  valid_from timestamptz,
  valid_to   timestamptz,
  max_uses   int,
  uses       int not null default 0,
  active     boolean not null default true
);

create table public.cars (
  id                 text primary key,                   -- slug, used in shared URLs
  name               text not null,
  brand              text not null,
  model              text not null default '',
  year               int  not null,
  category           public.car_category not null,
  price_per_day      int  not null check (price_per_day > 0),
  price_per_hour     int  not null check (price_per_hour > 0),
  power_hp           int  not null default 0,
  acceleration_0_100 numeric(3,1) not null default 0,
  top_speed_kmh      int  not null default 0,
  transmission       text not null check (transmission in ('Automatic', 'Manual')),
  fuel_type          text not null check (fuel_type in ('Petrol', 'Electric', 'Hybrid', 'Diesel')),
  seats              int  not null check (seats between 1 and 9),
  doors              int  not null check (doors between 2 and 5),
  color              text not null default '',
  image_path         text not null,                      -- storage path in car-images, or absolute URL / app path
  gallery_paths      text[] not null default '{}',
  description        text not null default '',
  features           text[] not null default '{}',
  rules              text[] not null default '{}',
  location           text not null default '',
  mileage_limit      text not null default '',
  host_name          text not null default 'Aurevon Fleet',
  host_rating        numeric(3,2) not null default 5,
  rating             numeric(3,2) not null default 5,
  review_count       int  not null default 0,
  is_available       boolean not null default true,      -- in service / listed
  is_popular         boolean not null default false,
  is_featured        boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Maintenance, cleaning, private use… Blocks hide the car for that window.
create table public.car_blocks (
  id         uuid primary key default gen_random_uuid(),
  car_id     text not null references public.cars on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text not null default 'Unavailable',
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.car_blocks (car_id, starts_at);

-- ---------------------------------------------------------------- bookings
create table public.bookings (
  id                 text primary key default 'BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  customer_id        uuid not null references public.profiles on delete restrict,
  car_id             text not null references public.cars on delete restrict,
  car_snapshot       jsonb not null,                      -- car row at booking time (history, receipts)
  pickup_date        date not null,
  pickup_time        text not null,                       -- 'hh:mm AM'
  return_date        date not null,
  return_time        text not null,
  pickup_at          timestamptz not null,
  return_at          timestamptz not null,
  pickup_location_id text not null references public.locations,
  return_location_id text not null references public.locations,
  duration_unit      public.duration_unit not null,
  duration_value     int not null,
  total_days         int not null,
  -- price snapshot, never recalculated except by extend_booking()
  unit_price   int not null,
  base_price   int not null,
  extras_total int not null,
  tax_amount   int not null,
  discount     int not null default 0,
  total_amount int not null,
  balance_due  int not null default 0,                    -- e.g. added by an extension after payment
  promo_code   text references public.promo_codes,
  driver       jsonb not null,                            -- {fullName,email,phone,licenseNumber,ageConfirmed}
  payment_method text not null default '',
  payment_status public.payment_status not null default 'unpaid',
  payment_ref    text unique,
  status         public.booking_status not null default 'pending',
  pass_code      text not null default 'PASS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (return_at > pickup_at),
  -- The database itself refuses double-bookings: no race between "check" and "insert".
  constraint no_overlap exclude using gist (car_id with =, tstzrange(pickup_at, return_at, '[)') with &&)
    where (status in ('pending', 'confirmed', 'active'))
);
create index on public.bookings (customer_id, pickup_at desc);
create index on public.bookings (status, pickup_at);

create table public.booking_extras (
  booking_id    text not null references public.bookings on delete cascade,
  service_id    text not null references public.extra_services,
  price_per_day int  not null,
  primary key (booking_id, service_id)
);

-- Digital rental agreement: the exact text signed, the typed name and the drawn signature.
create table public.rental_agreements (
  booking_id      text primary key references public.bookings on delete cascade,
  version         text not null,
  terms_text      text not null,
  terms_sha256    text not null,
  signed_name     text not null,
  signature_image text not null,                          -- PNG data URL
  signer_id       uuid not null references public.profiles,
  user_agent      text not null default '',
  signed_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- communication
-- One conversation per customer; a message may reference a booking.
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles on delete cascade,
  booking_id  text references public.bookings on delete set null,
  sender_id   uuid references public.profiles on delete set null,
  sender_role text not null check (sender_role in ('customer', 'staff')),
  sender_name text not null default '',
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index on public.messages (customer_id, created_at);

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  car_id      text not null references public.cars on delete cascade,
  booking_id  text not null unique references public.bookings on delete cascade,
  customer_id uuid not null references public.profiles on delete cascade,
  author_name text not null,
  rating      int  not null check (rating between 1 and 5),
  comment     text not null default '' check (char_length(comment) <= 1000),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.reviews (car_id, created_at desc);

create table public.favorites (
  user_id    uuid not null references public.profiles on delete cascade,
  car_id     text not null references public.cars on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, car_id)
);

-- Automated email / SMS / push queue, processed by the send-notification Edge Function.
create table public.notifications_outbox (
  id          bigint generated always as identity primary key,
  booking_id  text references public.bookings on delete cascade,
  user_id     uuid references public.profiles on delete cascade,
  event       text not null,
  channel     text not null check (channel in ('email', 'sms', 'push')),
  recipient   text not null,
  subject     text not null,
  body        text not null default '',
  url         text not null default '/bookings',
  status      text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts    int  not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  dedupe_key  text not null unique                        -- event+booking+channel (+recipient), stops duplicates
);
create index on public.notifications_outbox (status, created_at);

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles on delete cascade,
  endpoint     text not null unique,
  subscription jsonb not null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- tracking & ops
create table public.car_positions (
  id          bigint generated always as identity primary key,
  car_id      text not null references public.cars on delete cascade,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  recorded_at timestamptz not null,
  provider    text,
  received_at timestamptz not null default now()
);
create index on public.car_positions (car_id, recorded_at desc);

create table public.audit_log (
  id            bigint generated always as identity primary key,
  actor_id      uuid references public.profiles on delete set null,
  action        text not null,
  resource_type text not null,
  resource_id   text,
  details       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

-- Public heartbeat for live availability: customers subscribe to this one row
-- (they can't see other people's bookings, but they can see that something changed).
create table public.fleet_changes (
  id         int primary key default 1 check (id = 1),
  changed_at timestamptz not null default now()
);
insert into public.fleet_changes default values;

-- Server-side settings (ops email, function URL, cron secret). No client access.
create table public.app_settings (
  key   text primary key,
  value text not null
);

-- Aurevon — fixed-price rate packages (weekend specials, red-carpet/wedding hourly blocks, weekly rates).
-- Packages are priced on value at one fixed price; promo codes don't stack on them.
-- Mirrors calculatePackageQuote() in src/lib/pricing.ts.

create table public.rate_packages (
  id            text primary key default 'pkg-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  car_id        text not null references public.cars on delete cascade,
  name          text not null check (char_length(name) between 2 and 60),
  description   text not null default '',
  duration_unit public.duration_unit not null,
  duration      int  not null check (duration between 1 and 60),
  price         int  not null check (price > 0),
  includes      text[] not null default '{}',
  pickup_days   int[]  not null default '{}' check (pickup_days <@ array[0, 1, 2, 3, 4, 5, 6]),   -- 0 = Sunday
  active        boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.rate_packages (car_id, sort);
create trigger rate_packages_touch before update on public.rate_packages for each row execute function public.touch_updated_at();
create trigger rate_packages_fleet after insert or update or delete on public.rate_packages for each statement execute function public.bump_fleet();

alter table public.rate_packages enable row level security;
create policy "packages: public read active" on public.rate_packages for select
  using ((active and exists (select 1 from public.cars c where c.id = car_id and c.is_available)) or public.is_staff());
create policy "packages: manager write" on public.rate_packages for all using (public.is_manager()) with check (public.is_manager());

alter table public.bookings
  add column package_id   text references public.rate_packages on delete set null,
  add column package_name text;

-- Replace create_booking with the package-aware version (new trailing parameter).
drop function public.create_booking(text, date, text, date, text, text, text, public.duration_unit, text[], jsonb, text, text);

create or replace function public.create_booking(
  p_car_id text,
  p_pickup_date date, p_pickup_time text,
  p_return_date date, p_return_time text,
  p_pickup_location text, p_return_location text,
  p_duration_unit public.duration_unit,
  p_extra_ids text[],
  p_driver jsonb,
  p_payment_method text,
  p_promo_code text default null,
  p_package_id text default null
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_car public.cars;
  v_from timestamptz; v_to timestamptz;
  v_days int; v_hours int; v_value int; v_unit int;
  v_base int; v_extras int; v_tax int; v_subtotal int; v_discount int := 0;
  v_promo public.promo_codes;
  v_code text := nullif(upper(trim(coalesce(p_promo_code, ''))), '');
  v_extra_ids text[] := coalesce(p_extra_ids, array[]::text[]);
  v_booking public.bookings;
  v_pkg public.rate_packages;
begin
  if v_uid is null then raise exception 'Please sign in to book.'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.blocked_at is not null then raise exception 'Your account can’t make new bookings. Please contact us.'; end if;

  select * into v_car from public.cars where id = p_car_id;
  if not found or not v_car.is_available then raise exception 'This vehicle is not currently available.'; end if;
  if not exists (select 1 from public.locations where id = p_pickup_location and active)
     or not exists (select 1 from public.locations where id = p_return_location and active) then
    raise exception 'Choose a valid pick-up and return location.';
  end if;

  if p_package_id is not null then
    select * into v_pkg from public.rate_packages where id = p_package_id and car_id = p_car_id and active;
    if not found then raise exception 'This package is no longer available.'; end if;
    if v_code is not null then raise exception 'Promo codes can’t be used with package prices.'; end if;
    if p_duration_unit <> v_pkg.duration_unit then raise exception 'The rental type doesn’t match the package.'; end if;
    if cardinality(v_pkg.pickup_days) > 0 and not (extract(dow from p_pickup_date)::int = any (v_pkg.pickup_days)) then
      raise exception '% must start on an allowed pick-up day.', v_pkg.name;
    end if;
  end if;

  v_from := public.local_ts(p_pickup_date, p_pickup_time);
  v_to   := public.local_ts(p_return_date, p_return_time);
  if v_pkg.id is not null and v_to <> v_from + (case when v_pkg.duration_unit = 'day'
       then make_interval(days => v_pkg.duration) else make_interval(hours => v_pkg.duration) end) then
    raise exception 'The return time is set by the % package.', v_pkg.name;
  end if;
  if v_to <= v_from then raise exception 'Return must be after pick-up.'; end if;
  if v_from < now() - interval '1 hour' then raise exception 'The pick-up time is in the past.'; end if;
  if p_duration_unit = 'day' and p_return_date <= p_pickup_date then
    raise exception 'A daily rental needs a return date after the pick-up date.';
  end if;

  if coalesce(p_driver ->> 'ageConfirmed', 'false') <> 'true' then raise exception 'The driver must confirm they are 25 or older.'; end if;
  if char_length(coalesce(p_driver ->> 'fullName', '')) < 2 or coalesce(p_driver ->> 'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or char_length(regexp_replace(coalesce(p_driver ->> 'phone', ''), '\D', '', 'g')) < 7
     or char_length(coalesce(p_driver ->> 'licenseNumber', '')) < 4 then
    raise exception 'Driver details are incomplete.';
  end if;

  if exists (select 1 from unnest(v_extra_ids) x where x not in (select id from public.extra_services where active)) then
    raise exception 'One or more add-ons are not available.';
  end if;

  v_days  := greatest(1, p_return_date - p_pickup_date);
  v_hours := greatest(1, ceil(extract(epoch from (v_to - v_from)) / 3600.0)::int);
  v_value := case when p_duration_unit = 'hour' then v_hours else v_days end;
  v_unit  := case when p_duration_unit = 'hour' then v_car.price_per_hour else v_car.price_per_day end;
  v_base  := v_unit * v_value;
  if v_pkg.id is not null then
    v_days  := case when v_pkg.duration_unit = 'day' then v_pkg.duration else greatest(1, ceil(v_pkg.duration / 24.0)::int) end;
    v_hours := case when v_pkg.duration_unit = 'hour' then v_pkg.duration else v_pkg.duration * 24 end;
    v_value := v_pkg.duration;
    v_unit  := v_pkg.price;
    v_base  := v_pkg.price;
  end if;
  select coalesce(sum(case when p_duration_unit = 'hour' then round(price_per_day * v_hours / 24.0) else price_per_day * v_days end), 0)::int
    into v_extras from public.extra_services where id = any (v_extra_ids) and active;
  v_tax := round((v_base + v_extras) * 0.08)::int;
  v_subtotal := v_base + v_extras + v_tax;

  if v_code is not null then
    select * into v_promo from public.promo_codes
    where code = v_code and active
      and (valid_from is null or valid_from <= now()) and (valid_to is null or valid_to >= now())
      and (max_uses is null or uses < max_uses)
    for update;
    if not found then raise exception 'The promo code is invalid or has expired.'; end if;
    v_discount := case when v_promo.kind = 'percent' then round(v_subtotal * v_promo.value / 100.0)::int else least(v_promo.value, v_subtotal) end;
    update public.promo_codes set uses = uses + 1 where code = v_code;
  end if;

  if not public.car_is_free(p_car_id, v_from, v_to) then
    raise exception 'Sorry — this car is already booked for part of that time. Please pick other dates or another car.';
  end if;

  insert into public.bookings (
    customer_id, car_id, car_snapshot, pickup_date, pickup_time, return_date, return_time, pickup_at, return_at,
    pickup_location_id, return_location_id, duration_unit, duration_value, total_days,
    unit_price, base_price, extras_total, tax_amount, discount, total_amount, promo_code, driver, payment_method,
    package_id, package_name
  ) values (
    v_uid, p_car_id, to_jsonb(v_car), p_pickup_date, p_pickup_time, p_return_date, p_return_time, v_from, v_to,
    p_pickup_location, p_return_location, p_duration_unit, v_value, v_days,
    v_unit, v_base, v_extras, v_tax, v_discount, greatest(0, v_subtotal - v_discount), v_code,
    jsonb_build_object('fullName', trim(p_driver ->> 'fullName'), 'email', lower(trim(p_driver ->> 'email')),
                       'phone', trim(p_driver ->> 'phone'), 'licenseNumber', upper(trim(p_driver ->> 'licenseNumber')), 'ageConfirmed', true),
    coalesce(p_payment_method, ''),
    v_pkg.id, v_pkg.name
  ) returning * into v_booking;

  insert into public.booking_extras (booking_id, service_id, price_per_day)
  select v_booking.id, id, price_per_day from public.extra_services where id = any (v_extra_ids) and active;

  -- Fill in missing customer details from the booking (customer data management).
  update public.profiles set
    full_name      = case when full_name = '' then p_driver ->> 'fullName' else full_name end,
    phone          = case when phone = '' then p_driver ->> 'phone' else phone end,
    licence_number = case when licence_number = '' then upper(p_driver ->> 'licenseNumber') else licence_number end
  where id = v_uid;

  return v_booking;
exception when exclusion_violation then
  raise exception 'Sorry — this car was just booked for those dates. Please pick other dates or another car.';
end $$;


revoke all on function public.create_booking from public;
grant execute on function public.create_booking to authenticated;

-- Package bookings are a fixed price for a fixed window; extending them online would silently reprice them.
create or replace function public.guard_package_extension() returns trigger
language plpgsql as $$
begin
  if old.package_id is not null and new.return_at <> old.return_at then
    raise exception 'Package bookings can’t be extended online — message us and we’ll arrange extra time.';
  end if;
  return new;
end $$;
create trigger bookings_package_extension before update of return_at on public.bookings
  for each row execute function public.guard_package_extension();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rate_packages;
  end if;
end $$;

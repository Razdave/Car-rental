-- Aurevon — customer experience: loyalty perks, review requests, service recovery, staff replies.
-- Loyalty rewards repeat customers with add-ons and service, never with lower rental rates.
-- Mirrors src/lib/loyalty.ts.

-- ---------------------------------------------------------------- loyalty
create or replace function public.completed_trips(p_uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.bookings where customer_id = p_uid and status = 'completed'
$$;

create or replace function public.loyalty_tier(p_trips int) returns text
language sql immutable as $$
  select case when p_trips >= 10 then 'black' when p_trips >= 6 then 'gold' when p_trips >= 3 then 'silver' else 'member' end
$$;

create or replace function public.loyalty_free_extras(p_trips int) returns text[]
language sql immutable as $$
  select case public.loyalty_tier(p_trips)
    when 'black'  then array['additional-driver', 'unlimited-mileage', 'child-seat']
    when 'gold'   then array['additional-driver', 'unlimited-mileage']
    when 'silver' then array['additional-driver']
    else array[]::text[] end
$$;

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
  v_free text[];
begin
  if v_uid is null then raise exception 'Please sign in to book.'; end if;
  v_free := public.loyalty_free_extras(public.completed_trips(v_uid));   -- loyalty perks: free add-ons, never cheaper rates
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
  select coalesce(sum(case when id = any (v_free) then 0
                           when p_duration_unit = 'hour' then round(price_per_day * v_hours / 24.0)
                           else price_per_day * v_days end), 0)::int
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
  select v_booking.id, id, case when id = any (v_free) then 0 else price_per_day end
  from public.extra_services where id = any (v_extra_ids) and active;

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

-- ---------------------------------------------------------------- reviews: replies and service recovery
alter table public.reviews
  add column staff_reply    text check (char_length(staff_reply) <= 1000),
  add column staff_reply_at timestamptz,
  add column follow_up      text not null default 'none' check (follow_up in ('none', 'open', 'resolved')),
  add column follow_up_note text;

create or replace function public.before_review_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.follow_up := case when new.rating <= 3 then 'open' else 'none' end;
  elsif new.staff_reply is distinct from old.staff_reply then
    new.staff_reply_at := case when coalesce(new.staff_reply, '') = '' then null else now() end;
  end if;
  return new;
end $$;
create trigger reviews_before_write before insert or update on public.reviews
  for each row execute function public.before_review_write();

-- A low rating opens a follow-up and starts a personal conversation. The review is still published:
-- low ratings are never hidden or filtered (no review gating).
create or replace function public.after_review_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_car text; v_ops text;
begin
  if new.rating > 3 then return new; end if;
  select name into v_car from public.cars where id = new.car_id;
  insert into public.messages (customer_id, booking_id, sender_id, sender_role, body)
  values (new.customer_id, new.booking_id, null, 'staff',
          'We’re sorry your trip in the ' || coalesce(v_car, 'car') || ' wasn’t what you expected. A manager will contact you within one working day to put it right — feel free to reply here with any details.');
  select value into v_ops from public.app_settings where key = 'ops_email';
  if v_ops is not null then
    insert into public.notifications_outbox (booking_id, event, channel, recipient, subject, body, url, dedupe_key)
    values (new.booking_id, 'staff.review.low', 'email', v_ops,
            '[Staff] ' || new.rating || '★ review on ' || coalesce(v_car, new.car_id) || ' — follow up',
            coalesce(nullif(new.comment, ''), 'No comment left.'), '/admin?tab=experience', 'review.low:' || new.id)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end $$;
create trigger reviews_after_insert after insert on public.reviews
  for each row execute function public.after_review_insert();

-- ---------------------------------------------------------------- review requests (hourly)
create or replace function public.run_cx_jobs() returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  for b in
    select * from public.bookings bk
    where bk.status = 'completed'
      and bk.updated_at < now() - interval '2 hours'
      and bk.updated_at > now() - interval '14 days'
      and not exists (select 1 from public.reviews r where r.booking_id = bk.id)
  loop
    perform public.enqueue_booking_event(b, 'review.request', 'How was the ' || (b.car_snapshot ->> 'name') || '?',
      'It takes 30 seconds and helps other drivers choose. Tap to rate your trip.', array['email']);
  end loop;
end $$;
revoke all on function public.run_cx_jobs from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('aurevon-cx-jobs', '17 * * * *', 'select public.run_cx_jobs()');
  end if;
end $$;

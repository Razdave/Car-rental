-- Aurevon — booking workflow. Pricing mirrors src/lib/pricing.ts (8% tax, day = calendar days,
-- hour = ceil(minutes / 60), add-ons prorated /24 for hourly rentals).

-- 'YYYY-MM-DD' + 'hh:mm AM' in business time → timestamptz
create or replace function public.local_ts(d date, t text) returns timestamptz
language plpgsql stable set search_path = public as $$
begin
  if t !~ '^(0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$' then
    raise exception 'Times must look like 10:00 AM.';
  end if;
  return ((d::text || ' ' || t)::timestamp) at time zone 'Africa/Lagos';
end $$;

create or replace function public.log_action(p_action text, p_type text, p_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, action, resource_type, resource_id, details)
  values (auth.uid(), p_action, p_type, p_id, coalesce(p_details, '{}'))
$$;

-- Is the car free for [from, to)? Optionally ignoring one booking (for extensions).
create or replace function public.car_is_free(p_car_id text, p_from timestamptz, p_to timestamptz, p_ignore text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cars where id = p_car_id and is_available)
     and not exists (
       select 1 from public.bookings
       where car_id = p_car_id and status in ('pending', 'confirmed', 'active')
         and (p_ignore is null or id <> p_ignore)
         and tstzrange(pickup_at, return_at, '[)') && tstzrange(p_from, p_to, '[)'))
     and not exists (
       select 1 from public.car_blocks
       where car_id = p_car_id and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_from, p_to, '[)'))
$$;

-- ---------------------------------------------------------------- availability (public)
create or replace function public.unavailable_car_ids(p_pickup_date date, p_pickup_time text, p_return_date date, p_return_time text)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := public.local_ts(p_pickup_date, p_pickup_time);
  v_to   timestamptz := public.local_ts(p_return_date, p_return_time);
begin
  if v_to <= v_from then return array[]::text[]; end if;
  return coalesce((select array_agg(c.id) from public.cars c where not public.car_is_free(c.id, v_from, v_to)), array[]::text[]);
end $$;

create or replace function public.car_booked_days(p_car_id text, p_from date, p_to date)
returns date[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(d::date order by d), array[]::date[])
  from generate_series(p_from, least(p_to, p_from + 400), interval '1 day') as d
  where not public.car_is_free(p_car_id, public.local_ts(d::date, '12:00 AM'), public.local_ts(d::date + 1, '12:00 AM'))
$$;

-- ---------------------------------------------------------------- create
create or replace function public.create_booking(
  p_car_id text,
  p_pickup_date date, p_pickup_time text,
  p_return_date date, p_return_time text,
  p_pickup_location text, p_return_location text,
  p_duration_unit public.duration_unit,
  p_extra_ids text[],
  p_driver jsonb,
  p_payment_method text,
  p_promo_code text default null
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

  v_from := public.local_ts(p_pickup_date, p_pickup_time);
  v_to   := public.local_ts(p_return_date, p_return_time);
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
    unit_price, base_price, extras_total, tax_amount, discount, total_amount, promo_code, driver, payment_method
  ) values (
    v_uid, p_car_id, to_jsonb(v_car), p_pickup_date, p_pickup_time, p_return_date, p_return_time, v_from, v_to,
    p_pickup_location, p_return_location, p_duration_unit, v_value, v_days,
    v_unit, v_base, v_extras, v_tax, v_discount, greatest(0, v_subtotal - v_discount), v_code,
    jsonb_build_object('fullName', trim(p_driver ->> 'fullName'), 'email', lower(trim(p_driver ->> 'email')),
                       'phone', trim(p_driver ->> 'phone'), 'licenseNumber', upper(trim(p_driver ->> 'licenseNumber')), 'ageConfirmed', true),
    coalesce(p_payment_method, '')
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

-- ---------------------------------------------------------------- customer actions
create or replace function public.cancel_booking(p_id text) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare v public.bookings;
begin
  select * into v from public.bookings where id = p_id for update;
  if not found or (v.customer_id <> auth.uid() and not public.is_staff()) then raise exception 'Booking not found.'; end if;
  if v.status not in ('pending', 'confirmed') then raise exception 'This booking can no longer be cancelled.'; end if;
  if v.pickup_at <= now() and not public.is_staff() then raise exception 'Pick-up time has passed — please contact us.'; end if;
  update public.bookings set status = 'cancelled' where id = p_id returning * into v;
  perform public.log_action('booking.cancelled_by_customer', 'booking', p_id);
  return v;
end $$;

create or replace function public.extend_booking(p_id text, p_amount int) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v public.bookings;
  v_to timestamptz; v_return_date date; v_return_time text;
  v_days int; v_hours int; v_value int; v_base int; v_extras int; v_tax int; v_total int;
begin
  select * into v from public.bookings where id = p_id for update;
  if not found or (v.customer_id <> auth.uid() and not public.is_staff()) then raise exception 'Booking not found.'; end if;
  if v.status not in ('confirmed', 'active') then raise exception 'Only confirmed or active trips can be extended.'; end if;
  if p_amount < 1 or p_amount > (case when v.duration_unit = 'day' then 14 else 24 end) then raise exception 'That extension is too long — contact us.'; end if;

  if v.duration_unit = 'day' then
    v_to := v.return_at + make_interval(days => p_amount);
  else
    v_to := v.return_at + make_interval(hours => p_amount);
  end if;
  v_return_date := (v_to at time zone 'Africa/Lagos')::date;
  v_return_time := to_char(v_to at time zone 'Africa/Lagos', 'HH12:MI AM');

  if not public.car_is_free(v.car_id, v.return_at, v_to, v.id) then
    raise exception 'The car is booked straight after your trip, so it can’t be extended. Contact us for an alternative.';
  end if;

  v_days  := greatest(1, v_return_date - v.pickup_date);
  v_hours := greatest(1, ceil(extract(epoch from (v_to - v.pickup_at)) / 3600.0)::int);
  v_value := case when v.duration_unit = 'hour' then v_hours else v_days end;
  v_base  := v.unit_price * v_value;
  select coalesce(sum(case when v.duration_unit = 'hour' then round(price_per_day * v_hours / 24.0) else price_per_day * v_days end), 0)::int
    into v_extras from public.booking_extras where booking_id = v.id;
  v_tax := round((v_base + v_extras) * 0.08)::int;
  v_total := greatest(0, v_base + v_extras + v_tax - v.discount);

  update public.bookings set
    return_at = v_to, return_date = v_return_date, return_time = v_return_time,
    duration_value = v_value, total_days = v_days, base_price = v_base, extras_total = v_extras, tax_amount = v_tax,
    balance_due = balance_due + case when payment_status in ('paid', 'authorized') then v_total - total_amount else 0 end,
    total_amount = v_total
  where id = p_id returning * into v;
  perform public.log_action('booking.extended', 'booking', p_id, jsonb_build_object('amount', p_amount));
  return v;
exception when exclusion_violation then
  raise exception 'The car is booked straight after your trip, so it can’t be extended.';
end $$;

create or replace function public.sign_agreement(
  p_booking_id text, p_version text, p_terms_text text, p_signed_name text, p_signature_image text, p_user_agent text default ''
) returns public.bookings
language plpgsql security definer set search_path = public, extensions as $$
declare v public.bookings;
begin
  select * into v from public.bookings where id = p_booking_id;
  if not found or v.customer_id <> auth.uid() then raise exception 'Booking not found.'; end if;
  if v.status not in ('pending', 'confirmed', 'active') then raise exception 'This booking can’t be signed.'; end if;
  if exists (select 1 from public.rental_agreements where booking_id = p_booking_id) then raise exception 'This agreement is already signed.'; end if;
  if lower(trim(p_signed_name)) <> lower(trim(v.driver ->> 'fullName')) then
    raise exception 'Type the main driver’s name exactly as on the booking.';
  end if;
  if p_signature_image !~ '^data:image/png;base64,' or char_length(p_signature_image) > 600000 then
    raise exception 'The signature image is invalid.';
  end if;
  if char_length(coalesce(p_terms_text, '')) < 200 then raise exception 'Agreement text is missing.'; end if;

  insert into public.rental_agreements (booking_id, version, terms_text, terms_sha256, signed_name, signature_image, signer_id, user_agent)
  values (p_booking_id, p_version, p_terms_text, encode(digest(p_terms_text, 'sha256'), 'hex'), trim(p_signed_name),
          p_signature_image, auth.uid(), left(coalesce(p_user_agent, ''), 400));
  perform public.log_action('agreement.signed', 'booking', p_booking_id);
  return v;
end $$;

create or replace function public.submit_review(p_booking_id text, p_rating int, p_comment text)
returns public.reviews language plpgsql security definer set search_path = public as $$
declare v public.bookings; r public.reviews; v_name text;
begin
  select * into v from public.bookings where id = p_booking_id;
  if not found or v.customer_id <> auth.uid() then raise exception 'Booking not found.'; end if;
  if v.status <> 'completed' then raise exception 'You can review a car after your trip is completed.'; end if;
  if exists (select 1 from public.reviews where booking_id = p_booking_id) then raise exception 'You’ve already reviewed this trip.'; end if;
  v_name := split_part(trim(v.driver ->> 'fullName'), ' ', 1) ||
            coalesce(' ' || nullif(left(split_part(trim(v.driver ->> 'fullName'), ' ', 2), 1), '') || '.', '');
  insert into public.reviews (car_id, booking_id, customer_id, author_name, rating, comment)
  values (v.car_id, p_booking_id, auth.uid(), v_name, least(5, greatest(1, p_rating)), left(trim(coalesce(p_comment, '')), 1000))
  returning * into r;
  return r;
end $$;

-- Keep cars.rating / review_count in step with published reviews.
create or replace function public.apply_review_to_car() returns trigger
language plpgsql security definer set search_path = public as $$
declare delta int := 0; score int;
begin
  if tg_op = 'INSERT' and not new.hidden then delta := 1; score := new.rating;
  elsif tg_op = 'UPDATE' and old.hidden <> new.hidden then delta := case when new.hidden then -1 else 1 end; score := new.rating;
  else return new;
  end if;
  update public.cars set
    rating = case when review_count + delta <= 0 then 5   -- no published reviews left: back to the 'new' default
                  else round((rating * review_count + delta * score)::numeric / (review_count + delta), 2) end,
    review_count = greatest(0, review_count + delta)
  where id = new.car_id;
  return new;
end $$;
create trigger reviews_rating after insert or update of hidden on public.reviews
  for each row execute function public.apply_review_to_car();

-- ---------------------------------------------------------------- staff actions
create or replace function public.set_booking_status(p_id text, p_status public.booking_status)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v public.bookings;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  select * into v from public.bookings where id = p_id for update;
  if not found then raise exception 'Booking not found.'; end if;
  if not (
    (v.status = 'pending'   and p_status in ('confirmed', 'cancelled')) or
    (v.status = 'confirmed' and p_status in ('active', 'cancelled')) or
    (v.status = 'active'    and p_status in ('completed', 'cancelled'))
  ) then
    raise exception 'Can’t change a % booking to %.', v.status, p_status;
  end if;
  if p_status = 'confirmed' and not exists (select 1 from public.cars where id = v.car_id and is_available) then
    raise exception 'The car is out of service.';
  end if;
  if p_status = 'active' then
    if not exists (select 1 from public.rental_agreements where booking_id = p_id) then
      raise exception 'The customer must sign the rental agreement before the trip can start.';
    end if;
    if v.payment_status not in ('paid', 'authorized') then
      raise exception 'Payment must be received before the trip can start.';
    end if;
  end if;
  update public.bookings set status = p_status where id = p_id returning * into v;
  perform public.log_action('booking.status_changed', 'booking', p_id, jsonb_build_object('to', p_status));
  return v;
end $$;

create or replace function public.set_payment_status(p_id text, p_status public.payment_status)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v public.bookings;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  update public.bookings set payment_status = p_status, balance_due = case when p_status = 'paid' then 0 else balance_due end
  where id = p_id returning * into v;
  if not found then raise exception 'Booking not found.'; end if;
  perform public.log_action('booking.payment_status', 'booking', p_id, jsonb_build_object('to', p_status));
  return v;
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.create_booking, public.cancel_booking, public.extend_booking, public.sign_agreement,
  public.submit_review, public.set_booking_status, public.set_payment_status from public;
grant execute on function public.create_booking, public.cancel_booking, public.extend_booking, public.sign_agreement,
  public.submit_review, public.set_booking_status, public.set_payment_status to authenticated;
grant execute on function public.unavailable_car_ids, public.car_booked_days to anon, authenticated;

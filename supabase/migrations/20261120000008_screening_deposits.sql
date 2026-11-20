-- Aurevon — rigorous customer screening (licence, government ID, selfie, employment/corporate, driving record)
-- and refundable security deposits. Gates:
--   * create_booking: verification submitted (pending or verified); licence valid through the return date
--   * set_booking_status → confirmed: customer verified
--   * set_booking_status → active: verified, paid, agreement signed, deposit held
-- Mirrors src/lib/verification.ts and the demo backend.

create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected', 'expired');
create type public.deposit_status as enum ('none', 'pending', 'held', 'released', 'captured');

-- ---------------------------------------------------------------- verification records
create table public.customer_verifications (
  customer_id   uuid primary key references public.profiles on delete cascade,
  status        public.verification_status not null default 'unverified',
  checks        jsonb not null default '{"licence":{"status":"missing"},"identity":{"status":"missing"},"selfie":{"status":"missing"},"employment":{"status":"missing"},"record":{"status":"missing"}}',
  date_of_birth date,
  licence       jsonb not null default '{}',   -- {number,country,licenceClass,expiry,frontDoc,backDoc}
  identity      jsonb not null default '{}',   -- {type,number,expiry,doc}
  selfie_doc    text not null default '',
  employment    jsonb not null default '{}',   -- {type,employer,jobTitle,workEmail,corporateAccount,doc}
  record        jsonb not null default '{}',   -- {convictions,accidents,suspensions,details,doc}
  consent       boolean not null default false,
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.profiles on delete set null,
  reviewer_note text,
  updated_at    timestamptz not null default now()
);
create trigger verifications_touch before update on public.customer_verifications for each row execute function public.touch_updated_at();

alter table public.customer_verifications enable row level security;
create policy "verifications: read own or staff" on public.customer_verifications for select
  using (customer_id = auth.uid() or public.is_staff());
-- No direct writes: submit_verification() and review_verification() only.

-- Documents must live in the customer's own folder of the private bucket.
create or replace function public.own_doc(p_uid uuid, p_ref text) returns boolean
language sql immutable as $$ select coalesce(p_ref, '') like p_uid::text || '/%' $$;

create or replace function public.submit_verification(p jsonb) returns public.customer_verifications
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_prev public.customer_verifications;
  v_dob date; v_lic_exp date; v_id_exp date;
  v_checks jsonb := '{}';
  k text;
  v_row public.customer_verifications;
begin
  if v_uid is null then raise exception 'Please sign in.'; end if;
  v_dob := nullif(p ->> 'dateOfBirth', '')::date;
  v_lic_exp := nullif(p #>> '{licence,expiry}', '')::date;
  v_id_exp := nullif(p #>> '{identity,expiry}', '')::date;

  if v_dob is null or v_dob > (current_date - interval '25 years')::date then raise exception 'Drivers must be 25 or older.'; end if;
  if char_length(coalesce(p #>> '{licence,number}', '')) < 5 or v_lic_exp is null then raise exception 'Add the licence number and expiry date.'; end if;
  if v_lic_exp <= current_date then raise exception 'Your driving licence has expired.'; end if;
  if not public.own_doc(v_uid, p #>> '{licence,frontDoc}') or not public.own_doc(v_uid, p #>> '{licence,backDoc}') then raise exception 'Upload both sides of your licence.'; end if;
  if coalesce(p #>> '{identity,type}', '') not in ('passport', 'national_id', 'voters_card', 'residence_permit') or char_length(coalesce(p #>> '{identity,number}', '')) < 5 then
    raise exception 'Add your government ID type and number.';
  end if;
  if v_id_exp is not null and v_id_exp <= current_date then raise exception 'This ID has expired.'; end if;
  if not public.own_doc(v_uid, p #>> '{identity,doc}') then raise exception 'Upload a photo of your ID.'; end if;
  if not public.own_doc(v_uid, p ->> 'selfieDoc') then raise exception 'Take or upload a selfie.'; end if;
  if not public.own_doc(v_uid, p #>> '{employment,doc}') then raise exception 'Upload an employment or company document.'; end if;
  if (p #>> '{employment,type}') = 'corporate' then
    if char_length(coalesce(p #>> '{employment,corporateAccount}', '')) < 2 then raise exception 'Add the company name.'; end if;
  elsif char_length(coalesce(p #>> '{employment,employer}', '')) < 2 or char_length(coalesce(p #>> '{employment,jobTitle}', '')) < 2 then
    raise exception 'Add your employer and job title.';
  end if;
  if (coalesce((p #>> '{record,convictions}')::boolean, false) or coalesce((p #>> '{record,accidents}')::boolean, false)
      or coalesce((p #>> '{record,suspensions}')::boolean, false)) and char_length(coalesce(p #>> '{record,details}', '')) < 10 then
    raise exception 'Tell us briefly about the incidents on your record.';
  end if;
  if coalesce((p ->> 'consent')::boolean, false) is not true then raise exception 'Please confirm the declaration.'; end if;

  -- Resubmitting keeps checks that were already approved (unless the verification expired).
  select * into v_prev from public.customer_verifications where customer_id = v_uid;
  foreach k in array array['licence', 'identity', 'selfie', 'employment', 'record'] loop
    v_checks := v_checks || jsonb_build_object(k,
      case when v_prev.status is distinct from 'expired' and v_prev.checks #>> array[k, 'status'] = 'approved'
           then v_prev.checks -> k else '{"status":"pending"}'::jsonb end);
  end loop;

  insert into public.customer_verifications as cv (customer_id, status, checks, date_of_birth, licence, identity, selfie_doc, employment, record, consent, submitted_at, reviewed_at)
  values (v_uid, 'pending', v_checks, v_dob, p -> 'licence', p -> 'identity', p ->> 'selfieDoc', p -> 'employment', p -> 'record', true, now(), null)
  on conflict (customer_id) do update set
    status = 'pending', checks = excluded.checks, date_of_birth = excluded.date_of_birth, licence = excluded.licence,
    identity = excluded.identity, selfie_doc = excluded.selfie_doc, employment = excluded.employment, record = excluded.record,
    consent = true, submitted_at = now(), reviewed_at = null
  returning * into v_row;

  update public.profiles set licence_number = upper(p #>> '{licence,number}'), licence_expiry = to_char(v_lic_exp, 'MM/YYYY'),
    licence_verified_at = null where id = v_uid and v_row.status <> 'verified';
  perform public.log_action('verification.submitted', 'customer', v_uid::text);
  return v_row;
end $$;

-- Staff decision. Verified only if every check is approved, the driver is 25+, and the licence/ID are valid.
create or replace function public.review_verification(p_customer uuid, p_checks jsonb, p_note text default null)
returns public.customer_verifications
language plpgsql security definer set search_path = public as $$
declare v public.customer_verifications; v_all boolean; v_any_rejected boolean; v_status public.verification_status; k text;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  select * into v from public.customer_verifications where customer_id = p_customer for update;
  if not found or v.submitted_at is null then raise exception 'This customer hasn’t submitted verification yet.'; end if;
  foreach k in array array['licence', 'identity', 'selfie', 'employment', 'record'] loop
    if coalesce(p_checks #>> array[k, 'status'], '') not in ('pending', 'approved', 'rejected') then
      raise exception 'Every check needs a decision.';
    end if;
    if p_checks #>> array[k, 'status'] = 'rejected' and char_length(coalesce(p_checks #>> array[k, 'reason'], '')) < 3 then
      raise exception 'Give a reason for each rejected check.';
    end if;
  end loop;
  select bool_and(value ->> 'status' = 'approved'), bool_or(value ->> 'status' = 'rejected') into v_all, v_any_rejected from jsonb_each(p_checks);
  if v_all then
    if v.date_of_birth > (current_date - interval '25 years')::date then raise exception 'The driver is under 25 — verification can’t be approved.'; end if;
    if (v.licence ->> 'expiry')::date <= current_date then raise exception 'The driving licence has expired.'; end if;
    if nullif(v.identity ->> 'expiry', '')::date <= current_date then raise exception 'The ID document has expired.'; end if;
  end if;
  v_status := case when v_all then 'verified' when v_any_rejected then 'rejected' else 'pending' end;
  update public.customer_verifications set checks = p_checks, status = v_status, reviewed_at = now(), reviewed_by = auth.uid(), reviewer_note = nullif(p_note, '')
  where customer_id = p_customer returning * into v;
  update public.profiles set licence_verified_at = case when v_status = 'verified' then now() else null end where id = p_customer;
  perform public.log_action('verification.reviewed', 'customer', p_customer::text, jsonb_build_object('status', v_status));
  return v;
end $$;

-- Email the customer when a decision is made.
create or replace function public.on_verification_decision() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if new.status is not distinct from old.status or new.status not in ('verified', 'rejected', 'expired') then return new; end if;
  select email into v_email from public.profiles where id = new.customer_id;
  if coalesce(v_email, '') = '' then return new; end if;
  insert into public.notifications_outbox (user_id, event, channel, recipient, subject, body, url, dedupe_key)
  values (new.customer_id, 'verification.' || new.status, 'email', v_email,
    case new.status when 'verified' then 'You’re verified — ready to drive'
                    when 'rejected' then 'We need a little more information to verify you'
                    else 'Your verification has expired' end,
    case new.status when 'verified' then 'Your licence, ID and record have been checked. Your bookings can now be confirmed.'
                    when 'rejected' then coalesce(new.reviewer_note, 'Some details couldn’t be approved.') || ' Open the app to update them.'
                    else 'Your driving licence or ID has expired. Upload the renewed document to keep booking.' end,
    '/verify', 'verification.' || new.status || ':' || new.customer_id || ':' || extract(epoch from now())::bigint)
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
create trigger verifications_notify after update of status on public.customer_verifications
  for each row execute function public.on_verification_decision();

-- Staff opening a customer's documents is recorded (sensitive personal data).
create or replace function public.log_document_view(p_customer uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  perform public.log_action('verification.documents_viewed', 'customer', p_customer::text);
end $$;

-- Daily: expire verifications whose licence or ID has lapsed.
create or replace function public.run_screening_jobs() returns void
language sql security definer set search_path = public as $$
  update public.customer_verifications set status = 'expired'
  where status = 'verified'
    and ((licence ->> 'expiry')::date < current_date or nullif(identity ->> 'expiry', '')::date < current_date)
$$;

-- ---------------------------------------------------------------- deposits
alter table public.cars add column deposit_amount int check (deposit_amount >= 0);   -- null = category default

create or replace function public.deposit_for_car(c public.cars) returns int
language sql immutable as $$
  select coalesce(c.deposit_amount, case c.category
    when 'Luxury' then 750000 when 'Sports' then 500000 when 'SUV' then 400000 when 'Electric' then 400000 else 250000 end)
$$;

alter table public.bookings
  add column deposit_amount   int not null default 0,
  add column deposit_status   public.deposit_status not null default 'none',
  add column deposit_ref      text unique,
  add column deposit_captured int not null default 0,
  add column deposit_note     text;

-- Staff record of a deposit settlement (the deposits-settle Edge Function refunds through Paystack first).
create or replace function public.settle_deposit(p_id text, p_captured int, p_note text default '')
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v public.bookings;
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only.'; end if;
  select * into v from public.bookings where id = p_id for update;
  if not found then raise exception 'Booking not found.'; end if;
  if v.deposit_status <> 'held' then raise exception 'Only a held deposit can be released.'; end if;
  if v.status = 'active' then raise exception 'Complete the trip before releasing the deposit.'; end if;
  if p_captured < 0 or p_captured > v.deposit_amount then raise exception 'The amount kept must be between ₦0 and the deposit.'; end if;
  if p_captured > 0 and char_length(coalesce(trim(p_note), '')) < 5 then raise exception 'Give the reason for keeping part of the deposit.'; end if;
  update public.bookings set deposit_status = (case when p_captured > 0 then 'captured' else 'released' end)::public.deposit_status,
    deposit_captured = p_captured, deposit_note = nullif(trim(p_note), '')
  where id = p_id returning * into v;
  perform public.log_action('deposit.settled', 'booking', p_id, jsonb_build_object('captured', p_captured));
  return v;
end $$;

-- ---------------------------------------------------------------- patched workflow functions
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
  v_kyc public.customer_verifications;
begin
  if v_uid is null then raise exception 'Please sign in to book.'; end if;
  v_free := public.loyalty_free_extras(public.completed_trips(v_uid));

  -- Screening: verification must be submitted (staff confirm only once it's verified).
  select * into v_kyc from public.customer_verifications where customer_id = v_uid;
  if not found or v_kyc.status not in ('pending', 'verified') then
    raise exception 'Please verify your identity before booking.';
  end if;
  if (v_kyc.licence ->> 'expiry')::date < p_return_date then
    raise exception 'Your driving licence expires before the end of this trip.';
  end if;   -- loyalty perks: free add-ons, never cheaper rates
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
    package_id, package_name, deposit_amount, deposit_status
  ) values (
    v_uid, p_car_id, to_jsonb(v_car), p_pickup_date, p_pickup_time, p_return_date, p_return_time, v_from, v_to,
    p_pickup_location, p_return_location, p_duration_unit, v_value, v_days,
    v_unit, v_base, v_extras, v_tax, v_discount, greatest(0, v_subtotal - v_discount), v_code,
    jsonb_build_object('fullName', trim(p_driver ->> 'fullName'), 'email', lower(trim(p_driver ->> 'email')),
                       'phone', trim(p_driver ->> 'phone'), 'licenseNumber', upper(trim(p_driver ->> 'licenseNumber')), 'ageConfirmed', true),
    coalesce(p_payment_method, ''),
    v_pkg.id, v_pkg.name, public.deposit_for_car(v_car), (case when public.deposit_for_car(v_car) > 0 then 'pending' else 'none' end)::public.deposit_status
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
  if p_status = 'confirmed' and not exists (
    select 1 from public.customer_verifications where customer_id = v.customer_id and status = 'verified'
  ) then
    raise exception 'The customer must be verified before this booking can be confirmed (Verification tab).';
  end if;
  if p_status = 'active' then
    if not exists (select 1 from public.rental_agreements where booking_id = p_id) then
      raise exception 'The customer must sign the rental agreement before the trip can start.';
    end if;
    if v.payment_status not in ('paid', 'authorized') then
      raise exception 'Payment must be received before the trip can start.';
    end if;
    if v.deposit_status not in ('held', 'none') then
      raise exception 'The security deposit must be held before the trip can start.';
    end if;
    if not exists (select 1 from public.customer_verifications where customer_id = v.customer_id and status = 'verified') then
      raise exception 'The customer’s verification is no longer valid.';
    end if;
  end if;
  update public.bookings set status = p_status where id = p_id returning * into v;
  perform public.log_action('booking.status_changed', 'booking', p_id, jsonb_build_object('to', p_status));
  return v;
end $$;

create or replace function public.on_booking_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare car text := new.car_snapshot ->> 'name';
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_booking_event(new, 'booking.received', 'We’ve received your ' || car || ' booking (' || new.id || ')',
      'We’re checking availability and will confirm shortly. Next: complete payment and sign your rental agreement.', array['email']);
    return new;
  end if;

  if new.payment_status is distinct from old.payment_status then
    if new.payment_status = 'paid' then
      perform public.enqueue_booking_event(new, 'payment.received', 'Payment receipt for booking ' || new.id,
        'Thank you — we’ve received your payment.', array['email']);
    elsif new.payment_status = 'failed' then
      perform public.enqueue_booking_event(new, 'payment.failed', 'Payment for booking ' || new.id || ' didn’t go through',
        'Please try again from your booking, or contact us.', array['email', 'sms']);
    elsif new.payment_status = 'refunded' then
      perform public.enqueue_booking_event(new, 'payment.refunded', 'Refund issued for booking ' || new.id,
        'Your refund is on its way. It can take 3–5 working days to appear.', array['email']);
    end if;
  end if;

  if new.deposit_status is distinct from old.deposit_status then
    if new.deposit_status = 'held' then
      perform public.enqueue_booking_event(new, 'deposit.held', 'Security deposit received for ' || new.id,
        'We’re holding a refundable deposit of ₦' || to_char(new.deposit_amount, 'FM999,999,999') || '. It’s released after the car is returned and checked.', array['email']);
    elsif new.deposit_status = 'released' then
      perform public.enqueue_booking_event(new, 'deposit.released', 'Your deposit for ' || new.id || ' has been released',
        'The full deposit is on its way back to you. Refunds can take 3–5 working days to appear.', array['email', 'sms']);
    elsif new.deposit_status = 'captured' then
      perform public.enqueue_booking_event(new, 'deposit.captured', 'Deposit update for ' || new.id,
        '₦' || to_char(new.deposit_captured, 'FM999,999,999') || ' was kept from your deposit: ' || coalesce(new.deposit_note, 'see your booking') ||
        '. The rest is on its way back to you.', array['email', 'sms']);
    end if;
  end if;

  if new.status is distinct from old.status then
    case new.status
      when 'confirmed' then perform public.enqueue_booking_event(new, 'booking.confirmed', 'Confirmed: your ' || car || ' is booked',
        'See you on ' || to_char(new.pickup_at at time zone 'Africa/Lagos', 'Dy DD Mon, HH12:MI AM') || '. Your pass code is ' || new.pass_code || '.', array['email', 'sms']);
      when 'active' then perform public.enqueue_booking_event(new, 'trip.started', 'Enjoy your ' || car || ' — trip started',
        'Return by ' || to_char(new.return_at at time zone 'Africa/Lagos', 'Dy DD Mon, HH12:MI AM') || '. 24/7 assistance: reply to this message.', array['email']);
      when 'completed' then perform public.enqueue_booking_event(new, 'trip.completed', 'Thanks for driving with Aurevon — receipt ' || new.id,
        'We’d love a quick review of your trip.', array['email']);
      when 'cancelled' then perform public.enqueue_booking_event(new, 'booking.cancelled', 'Booking ' || new.id || ' cancelled',
        'Your booking has been cancelled. Any payment will be refunded in line with our policy.', array['email', 'sms']);
      else null;
    end case;
  end if;
  return new;
end $$;

drop trigger bookings_notify on public.bookings;
create trigger bookings_notify after insert or update of status, payment_status, deposit_status on public.bookings
  for each row execute function public.on_booking_change();

revoke all on function public.create_booking, public.set_booking_status, public.submit_verification, public.review_verification,
  public.log_document_view, public.settle_deposit from public;
grant execute on function public.create_booking, public.set_booking_status, public.submit_verification, public.review_verification,
  public.log_document_view, public.settle_deposit to authenticated;
revoke all on function public.run_screening_jobs from public, anon, authenticated;

-- ---------------------------------------------------------------- private document storage
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('verification-docs', 'verification-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do nothing;
    execute $p$ create policy "kyc: upload own" on storage.objects for insert to authenticated
      with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text) $p$;
    execute $p$ create policy "kyc: read own or staff" on storage.objects for select to authenticated
      using (bucket_id = 'verification-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())) $p$;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('aurevon-screening-jobs', '5 2 * * *', 'select public.run_screening_jobs()');
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.customer_verifications;
  end if;
end $$;

-- Aurevon — automated customer communication, live availability heartbeat, scheduled jobs.
-- Mirrors src/lib/backend/notifications.ts.

-- Queue one event for a booking on the requested channels (deduplicated).
create or replace function public.enqueue_booking_event(
  p_booking public.bookings, p_event text, p_subject text, p_body text, p_channels text[]
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_email text := p_booking.driver ->> 'email';
  v_phone text := p_booking.driver ->> 'phone';
  v_url text := '/bookings/' || p_booking.id;
  v_ops text;
begin
  select * into v_profile from public.profiles where id = p_booking.customer_id;

  if 'email' = any (p_channels) and coalesce(v_email, '') <> '' then
    insert into public.notifications_outbox (booking_id, user_id, event, channel, recipient, subject, body, url, dedupe_key)
    values (p_booking.id, p_booking.customer_id, p_event, 'email', v_email, p_subject, p_body, v_url,
            p_event || ':' || p_booking.id || ':email')
    on conflict (dedupe_key) do nothing;
  end if;

  if 'sms' = any (p_channels) and coalesce(v_profile.sms_opt_in, true) and coalesce(v_phone, '') <> '' then
    insert into public.notifications_outbox (booking_id, user_id, event, channel, recipient, subject, body, url, dedupe_key)
    values (p_booking.id, p_booking.customer_id, p_event, 'sms', v_phone, p_subject, p_body, v_url,
            p_event || ':' || p_booking.id || ':sms')
    on conflict (dedupe_key) do nothing;
  end if;

  -- Push goes to every device the customer enabled.
  if exists (select 1 from public.push_subscriptions where user_id = p_booking.customer_id) then
    insert into public.notifications_outbox (booking_id, user_id, event, channel, recipient, subject, body, url, dedupe_key)
    values (p_booking.id, p_booking.customer_id, p_event, 'push', p_booking.customer_id::text, p_subject, p_body, v_url,
            p_event || ':' || p_booking.id || ':push')
    on conflict (dedupe_key) do nothing;
  end if;

  -- Staff alerts for things the ops team must act on.
  if p_event in ('booking.received', 'payment.failed', 'trip.overdue', 'booking.cancelled') then
    select value into v_ops from public.app_settings where key = 'ops_email';
    if v_ops is not null then
      insert into public.notifications_outbox (booking_id, event, channel, recipient, subject, body, url, dedupe_key)
      values (p_booking.id, 'staff.' || p_event, 'email', v_ops, '[Staff] ' || p_subject, p_body, '/admin?tab=bookings',
              'staff.' || p_event || ':' || p_booking.id)
      on conflict (dedupe_key) do nothing;
    end if;
  end if;
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

create trigger bookings_notify after insert or update of status, payment_status on public.bookings
  for each row execute function public.on_booking_change();

create or replace function public.on_agreement_signed() returns trigger
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = new.booking_id;
  perform public.enqueue_booking_event(b, 'agreement.signed', 'Your signed rental agreement for ' || b.id,
    'A copy of the agreement you signed is attached and available in the app.', array['email']);
  return new;
end $$;
create trigger agreements_notify after insert on public.rental_agreements
  for each row execute function public.on_agreement_signed();

-- Fill sender_name and push staff replies to the customer's devices.
create or replace function public.on_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.sender_name = '' then
    new.sender_name := case when new.sender_role = 'staff' then 'Aurevon concierge'
                            else coalesce((select nullif(full_name, '') from public.profiles where id = new.sender_id), 'Customer') end;
  end if;
  return new;
end $$;
create trigger messages_sender before insert on public.messages for each row execute function public.on_message();

create or replace function public.on_staff_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sender_role = 'staff' and exists (select 1 from public.push_subscriptions where user_id = new.customer_id) then
    insert into public.notifications_outbox (booking_id, user_id, event, channel, recipient, subject, body, url, dedupe_key)
    values (new.booking_id, new.customer_id, 'message.received', 'push', new.customer_id::text, 'Aurevon concierge',
            left(new.body, 140), '/messages', 'message:' || new.id);
  end if;
  return new;
end $$;
create trigger messages_push after insert on public.messages for each row execute function public.on_staff_message();

-- ---------------------------------------------------------------- live availability heartbeat
create or replace function public.bump_fleet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.fleet_changes set changed_at = now() where id = 1;
  return null;
end $$;
create trigger bookings_fleet after insert or update or delete on public.bookings for each statement execute function public.bump_fleet();
create trigger blocks_fleet   after insert or update or delete on public.car_blocks for each statement execute function public.bump_fleet();
create trigger cars_fleet     after insert or update or delete on public.cars for each statement execute function public.bump_fleet();
create trigger reviews_fleet  after insert or update on public.reviews for each statement execute function public.bump_fleet();

-- ---------------------------------------------------------------- scheduled jobs (every 5 minutes)
create or replace function public.run_scheduled_jobs() returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  -- Release unpaid bookings after 30 minutes so the car becomes bookable again.
  update public.bookings set status = 'cancelled', payment_status = 'failed'
  where status = 'pending' and payment_status = 'unpaid' and created_at < now() - interval '30 minutes';

  for b in select * from public.bookings where status = 'confirmed' and pickup_at > now() and pickup_at <= now() + interval '24 hours' loop
    perform public.enqueue_booking_event(b, 'reminder.pickup_24h', 'Tomorrow: your ' || (b.car_snapshot ->> 'name'),
      'Pick-up ' || to_char(b.pickup_at at time zone 'Africa/Lagos', 'Dy HH12:MI AM') ||
      case when exists (select 1 from public.rental_agreements where booking_id = b.id) then '.' else '. Please sign your rental agreement in the app.' end,
      array['email', 'sms']);
  end loop;

  for b in select * from public.bookings where status = 'confirmed' and pickup_at > now() and pickup_at <= now() + interval '2 hours' loop
    perform public.enqueue_booking_event(b, 'reminder.pickup_2h', 'Your ' || (b.car_snapshot ->> 'name') || ' is almost ready',
      'Pick-up at ' || to_char(b.pickup_at at time zone 'Africa/Lagos', 'HH12:MI AM') || '. Bring your driving licence.', array['sms']);
  end loop;

  for b in select * from public.bookings where status = 'active' and return_at > now() and return_at <= now() + interval '2 hours' loop
    perform public.enqueue_booking_event(b, 'reminder.return_2h', 'Return due soon',
      'Please return the ' || (b.car_snapshot ->> 'name') || ' by ' || to_char(b.return_at at time zone 'Africa/Lagos', 'HH12:MI AM') || '.', array['sms']);
  end loop;

  for b in select * from public.bookings where status = 'active' and return_at < now() - interval '30 minutes' loop
    perform public.enqueue_booking_event(b, 'trip.overdue', 'Your ' || (b.car_snapshot ->> 'name') || ' is overdue',
      'Your return time has passed. Late fees apply per hour — please contact us.', array['email', 'sms']);
  end loop;
end $$;

-- Hands queued messages to the send-notification Edge Function (needs pg_net + settings).
create or replace function public.dispatch_notifications() returns void
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select value into v_url from public.app_settings where key = 'functions_url';
  select value into v_secret from public.app_settings where key = 'cron_secret';
  if v_url is null or v_secret is null or not exists (select 1 from public.notifications_outbox where status = 'queued' and attempts < 5) then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/send-notification',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
end $$;

revoke all on function public.run_scheduled_jobs, public.dispatch_notifications, public.enqueue_booking_event from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('aurevon-scheduled-jobs', '*/5 * * * *', 'select public.run_scheduled_jobs()');
    if exists (select 1 from pg_available_extensions where name = 'pg_net') then
      create extension if not exists pg_net with schema extensions;
      perform cron.schedule('aurevon-dispatch-notifications', '* * * * *', 'select public.dispatch_notifications()');
    end if;
  end if;
end $$;

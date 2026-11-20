-- Aurevon — roles, row-level security, Realtime, Storage

-- ---------------------------------------------------------------- role helpers
create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('staff', 'manager', 'admin'), false)
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('manager', 'admin'), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- ---------------------------------------------------------------- profiles
-- New auth user → profile row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Customers may edit their own contact details, but never role, verification, notes or block status.
create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;           -- service role / SQL editor
  new.email := old.email;
  if not public.is_staff() then
    new.role := old.role;
    new.licence_verified_at := old.licence_verified_at;
    new.notes := old.notes;
    new.blocked_at := old.blocked_at;
  elsif not public.is_admin() then
    new.role := old.role;                                    -- only admins change roles
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create trigger cars_touch before update on public.cars for each row execute function public.touch_updated_at();
create trigger bookings_touch before update on public.bookings for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.profiles             enable row level security;
alter table public.locations            enable row level security;
alter table public.extra_services       enable row level security;
alter table public.promo_codes          enable row level security;
alter table public.cars                 enable row level security;
alter table public.car_blocks           enable row level security;
alter table public.bookings             enable row level security;
alter table public.booking_extras       enable row level security;
alter table public.rental_agreements    enable row level security;
alter table public.messages             enable row level security;
alter table public.reviews              enable row level security;
alter table public.favorites            enable row level security;
alter table public.notifications_outbox enable row level security;
alter table public.push_subscriptions   enable row level security;
alter table public.car_positions        enable row level security;
alter table public.audit_log            enable row level security;
alter table public.fleet_changes        enable row level security;
alter table public.app_settings         enable row level security;   -- no policies: server only

-- profiles
create policy "profiles: read own or staff" on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy "profiles: update own or staff" on public.profiles for update
  using (id = auth.uid() or public.is_staff()) with check (id = auth.uid() or public.is_staff());

-- catalogue (public read)
create policy "locations: public read" on public.locations for select using (active or public.is_staff());
create policy "locations: manager write" on public.locations for all using (public.is_manager()) with check (public.is_manager());
create policy "extras: public read" on public.extra_services for select using (active or public.is_staff());
create policy "extras: manager write" on public.extra_services for all using (public.is_manager()) with check (public.is_manager());
create policy "promos: staff read" on public.promo_codes for select using (public.is_staff());
create policy "promos: manager write" on public.promo_codes for all using (public.is_manager()) with check (public.is_manager());

-- cars: listed cars are public; staff edit listings (pricing, photos, rules, availability)
create policy "cars: public read listed" on public.cars for select using (is_available or public.is_staff());
create policy "cars: staff update" on public.cars for update using (public.is_staff()) with check (public.is_staff());
create policy "cars: manager insert" on public.cars for insert with check (public.is_manager());
create policy "cars: manager delete" on public.cars for delete using (public.is_manager());

create policy "blocks: staff all" on public.car_blocks for all using (public.is_staff()) with check (public.is_staff());

-- bookings: read own / staff. All writes go through security-definer functions.
create policy "bookings: read own or staff" on public.bookings for select
  using (customer_id = auth.uid() or public.is_staff());
create policy "booking_extras: read with booking" on public.booking_extras for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or public.is_staff())));
create policy "agreements: read with booking" on public.rental_agreements for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or public.is_staff())));

-- messages
create policy "messages: read own thread or staff" on public.messages for select
  using (customer_id = auth.uid() or public.is_staff());
create policy "messages: customer writes own thread" on public.messages for insert
  with check (sender_role = 'customer' and customer_id = auth.uid() and sender_id = auth.uid());
create policy "messages: staff reply" on public.messages for insert
  with check (sender_role = 'staff' and public.is_staff() and sender_id = auth.uid());

-- reviews: published are public; staff moderate; customers create via submit_review()
create policy "reviews: public read published" on public.reviews for select
  using (not hidden or public.is_staff() or customer_id = auth.uid());
create policy "reviews: staff moderate" on public.reviews for update using (public.is_staff()) with check (public.is_staff());

create policy "favorites: own" on public.favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push: own" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "outbox: staff read" on public.notifications_outbox for select using (public.is_staff());
create policy "positions: staff read" on public.car_positions for select using (public.is_staff());
create policy "audit: manager read" on public.audit_log for select using (public.is_manager());
create policy "fleet_changes: public read" on public.fleet_changes for select using (true);

-- ---------------------------------------------------------------- Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.bookings, public.rental_agreements, public.messages, public.cars, public.car_blocks,
      public.reviews, public.notifications_outbox, public.fleet_changes;
  end if;
end $$;

-- ---------------------------------------------------------------- Storage (car photos)
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('car-images', 'car-images', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$ create policy "car-images: staff upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'car-images' and public.is_staff()) $p$;
    execute $p$ create policy "car-images: staff update" on storage.objects for update to authenticated
      using (bucket_id = 'car-images' and public.is_staff()) $p$;
    execute $p$ create policy "car-images: staff delete" on storage.objects for delete to authenticated
      using (bucket_id = 'car-images' and public.is_staff()) $p$;
  end if;
end $$;

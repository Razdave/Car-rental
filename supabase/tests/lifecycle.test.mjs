// Runs the Supabase migrations in PGlite and exercises the booking lifecycle.
// Usage: npm run test:db   (runs every migration in PGlite and walks a booking through its lifecycle)
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] ?? fileURLToPath(new URL('../..', import.meta.url));
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};
const expectError = async (sql, params, pattern, label) => {
  try {
    await db.query(sql, params);
    ok(false, `${label} (no error raised)`);
  } catch (e) {
    ok(pattern.test(e.message), `${label} → "${e.message}"`);
  }
};

// --- Supabase stand-ins: auth schema, roles, extensions schema
await db.exec(`
  create schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
`);

for (const file of readdirSync(join(root, 'supabase/migrations')).sort()) {
  try {
    await db.exec(readFileSync(join(root, 'supabase/migrations', file), 'utf8'));
    ok(true, `migration ${file}`);
  } catch (e) {
    ok(false, `migration ${file}: ${e.message}`);
    process.exit(1);
  }
}
// Supabase's default privileges: API roles can reach public tables; RLS decides rows.
await db.exec(`grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated; grant usage, select on all sequences in schema public to anon, authenticated;`);
await db.exec(readFileSync(join(root, 'supabase/seed.sql'), 'utf8'));
await db.exec(readFileSync(join(root, 'supabase/seed.sql'), 'utf8')); // idempotent
ok((await db.query('select count(*)::int n from cars')).rows[0].n === 4, 'seed: 4 cars (re-run safe)');

// --- users
const CUSTOMER = '11111111-1111-1111-1111-111111111111';
const STAFF = '22222222-2222-2222-2222-222222222222';
const OTHER = '33333333-3333-3333-3333-333333333333';
await db.exec(`
  insert into auth.users (id, email) values ('${CUSTOMER}', 'ada@example.com'), ('${STAFF}', 'ops@example.com'), ('${OTHER}', 'bo@example.com');
  update profiles set role = 'staff', full_name = 'Ops' where id = '${STAFF}';
  insert into app_settings values ('ops_email', 'ops@aurevon.example');
  -- Existing, already-screened customers for the booking lifecycle tests.
  insert into customer_verifications (customer_id, status, date_of_birth, licence, identity, consent, submitted_at, reviewed_at)
  select id, 'verified', '1988-04-01', '{"number":"LAG-12345","expiry":"2031-01-01"}', '{"type":"passport","number":"A0000001"}', true, now(), now()
  from profiles where id in ('${CUSTOMER}', '${OTHER}');
`);
ok((await db.query('select count(*)::int n from profiles')).rows[0].n === 3, 'profiles auto-created for new auth users');
const as = (uid) => db.exec(`select set_config('test.uid', '${uid}', false)`);

// Protected columns: a customer can't promote themselves
await as(CUSTOMER);
await db.exec(`update profiles set role = 'admin', notes = 'hacked', phone = '+2348000000000' where id = '${CUSTOMER}'`);
const me = (await db.query(`select role, notes, phone from profiles where id = '${CUSTOMER}'`)).rows[0];
ok(me.role === 'customer' && me.notes === '' && me.phone === '+2348000000000', 'customer cannot change own role/notes, can change phone');

// --- create_booking: 3-day Audi R8 with insurance + DRIVE20
const tomorrow = (await db.query(`select (now() at time zone 'Africa/Lagos')::date + 2 as d`)).rows[0].d.toISOString().slice(0, 10);
const plus = async (n) => (await db.query(`select $1::date + $2::int as d`, [tomorrow, n])).rows[0].d.toISOString().slice(0, 10);
const ret = await plus(3);
const driver = JSON.stringify({ fullName: 'Ada Lovelace', email: 'ada@example.com', phone: '+234 801 234 5678', licenseNumber: 'lag-12345', ageConfirmed: true });
const create = `select * from create_booking($1, $2, '10:00 AM', $3, '10:00 AM', 'loc-1', 'loc-1', $4, $5, $6::jsonb, 'Paystack', $7)`;
const b1 = (await db.query(create, ['car-audi-r8', tomorrow, ret, 'day', ['insurance-full'], driver, 'drive20'])).rows[0];
// JS: base 800000*3=2,400,000; extras 25000*3=75,000; tax round(2,475,000*0.08)=198,000; subtotal 2,673,000; 20% = 534,600 → 2,138,400
ok(b1.base_price === 2400000 && b1.extras_total === 75000 && b1.tax_amount === 198000, 'pricing matches client (base/extras/tax)');
ok(b1.discount === 534600 && b1.total_amount === 2138400, `promo DRIVE20 applied → total ${b1.total_amount}`);
ok(b1.status === 'pending' && b1.payment_status === 'unpaid', 'new booking is pending + unpaid');
ok((await db.query(`select licence_number from profiles where id = '${CUSTOMER}'`)).rows[0].licence_number === 'LAG-12345', 'customer profile filled from driver details');

// Hourly pricing: 5 hours G63 → 200000*5 = 1,000,000 + tax 80,000
const h = (await db.query(`select * from create_booking('car-g63-amg', $1, '09:00 AM', $1, '02:00 PM', 'loc-2', 'loc-2', 'hour', '{}', $2::jsonb, 'Paystack')`, [tomorrow, driver])).rows[0];
ok(h.duration_value === 5 && h.total_amount === 1080000, `hourly: 5 h → ${h.total_amount}`);

// Overlap is refused (by function check and by the exclusion constraint)
await as(OTHER);
await expectError(create, ['car-audi-r8', await plus(1), await plus(5), 'day', [], driver.replace('Ada Lovelace', 'Bo Smith'), null], /already booked|just booked/, 'overlapping booking refused');
const back2back = (await db.query(create, ['car-audi-r8', ret, await plus(5), 'day', [], driver, null])).rows[0];
ok(Boolean(back2back.id), 'back-to-back booking (return 10:00 → pick-up 10:00) allowed');
await expectError(create, ['car-audi-r8', tomorrow, ret, 'day', [], driver, 'NOPE'], /promo code/, 'invalid promo refused');

// Availability RPCs
const unavailable = (await db.query(`select unavailable_car_ids($1, '10:00 AM', $2, '10:00 AM') ids`, [tomorrow, ret])).rows[0].ids;
ok(unavailable.includes('car-audi-r8') && !unavailable.includes('car-bmw-m4'), `unavailable_car_ids → ${unavailable.join(', ')}`);
const days = (await db.query(`select car_booked_days('car-audi-r8', $1, $2) d`, [tomorrow, await plus(10)])).rows[0].d;
ok(days.length === 6, `car_booked_days → ${days.length} days`);

// RLS: other customer can't see Ada's booking (run as role authenticated)
await db.exec(`set role authenticated`);
const visible = (await db.query(`select id from bookings`)).rows.map((r) => r.id);
ok(!visible.includes(b1.id) && visible.includes(back2back.id), 'RLS: customers only see their own bookings');
await expectError(`insert into bookings (id) values ('x')`, [], /row-level security|permission|null value/, 'RLS: direct insert into bookings blocked');
const fleet = (await db.query(`select changed_at from fleet_changes`)).rows.length;
ok(fleet === 1, 'RLS: fleet heartbeat readable by customers');
await db.exec(`reset role`);

// --- staff workflow
await as(CUSTOMER);
await expectError(`select set_booking_status($1, 'confirmed')`, [b1.id], /Staff only/, 'customer cannot confirm bookings');
await as(STAFF);
await db.query(`select set_booking_status($1, 'confirmed')`, [b1.id]);
await expectError(`select set_booking_status($1, 'active')`, [b1.id], /agreement/, 'cannot start trip before agreement signed');
await expectError(`select set_booking_status($1, 'completed')`, [b1.id], /Can’t change/, 'invalid transition refused');

// --- digital agreement
await as(CUSTOMER);
const terms = 'Aurevon Rental Agreement '.repeat(20);
await expectError(`select sign_agreement($1, '2026-11', $2, 'Someone Else', 'data:image/png;base64,AAA')`, [b1.id, terms], /exactly/, 'agreement name must match driver');
await db.query(`select sign_agreement($1, '2026-11', $2, ' ada lovelace ', 'data:image/png;base64,AAA', 'test')`, [b1.id, terms]);
const ag = (await db.query(`select terms_sha256 from rental_agreements where booking_id = $1`, [b1.id])).rows[0];
ok(ag && ag.terms_sha256.length === 64, 'agreement stored with SHA-256 of the signed text');
await expectError(`select sign_agreement($1, '2026-11', $2, 'Ada Lovelace', 'data:image/png;base64,AAA')`, [b1.id, terms], /already signed/, 'cannot sign twice');

await as(STAFF);
await expectError(`select set_booking_status($1, 'active')`, [b1.id], /Payment/, 'cannot start trip before payment');
await db.query(`select set_payment_status($1, 'paid')`, [b1.id]);
await expectError(`select set_booking_status($1, 'active')`, [b1.id], /security deposit/, 'cannot start trip before the deposit is held');
ok(b1.deposit_amount === 500000 && b1.deposit_status === 'pending', 'sports car deposit of ₦500,000 required at booking');
await db.exec(`update bookings set deposit_status = 'held', deposit_ref = 'dep-test-1' where id = '${b1.id}'`); // as Paystack would
await db.query(`select set_booking_status($1, 'active')`, [b1.id]);
await expectError(`select settle_deposit($1, 0, '')`, [b1.id], /Complete the trip/, 'deposit can’t be released mid-trip');

// Extension while active: +1 day blocked by back-to-back booking
await as(CUSTOMER);
await expectError(`select extend_booking($1, 1)`, [b1.id], /booked straight after/, 'extension refused when next booking follows');
await as(STAFF);
await db.query(`select set_booking_status($1, 'completed')`, [b1.id]);

// --- reviews
await as(CUSTOMER);
const before = (await db.query(`select rating::float r, review_count n from cars where id = 'car-audi-r8'`)).rows[0];
const rv = (await db.query(`select * from submit_review($1, 4, 'Great car')`, [b1.id])).rows[0];
ok(rv.author_name === 'Ada L.', `review author anonymised → ${rv.author_name}`);
const after = (await db.query(`select rating::float r, review_count n from cars where id = 'car-audi-r8'`)).rows[0];
ok(after.n === before.n + 1 && after.r < before.r, `car rating updated ${before.r} → ${after.r}`);
await expectError(`select submit_review($1, 5, 'again')`, [b1.id], /already reviewed/, 'one review per trip');
await as(STAFF);
await db.exec(`update reviews set hidden = true where id = '${rv.id}'`);
const hidden = (await db.query(`select rating::float r, review_count n from cars where id = 'car-audi-r8'`)).rows[0];
ok(hidden.n === before.n && Math.abs(hidden.r - before.r) < 0.011, 'hiding a review reverts the rating');

// --- messages
await as(CUSTOMER);
await db.query(`insert into messages (customer_id, sender_id, sender_role, body) values ($1, $1, 'customer', 'Can you deliver to VI?')`, [CUSTOMER]);
await db.exec(`set role authenticated`);
await expectError(`insert into messages (customer_id, sender_id, sender_role, body) values ($1, $1, 'staff', 'fake staff')`, [CUSTOMER], /row-level security/, 'RLS: customer cannot post as staff');
await db.exec(`reset role`);
const msg = (await db.query(`select sender_name from messages limit 1`)).rows[0];
ok(msg.sender_name === 'Ada Lovelace', 'message sender name filled in');

// --- cancellation + automated messages
await as(OTHER);
await db.query(`select cancel_booking($1)`, [back2back.id]);
const events = (await db.query(`select event, channel from notifications_outbox order by id`)).rows.map((r) => `${r.event}/${r.channel}`);
for (const e of ['booking.received/email', 'staff.booking.received/email', 'booking.confirmed/email', 'booking.confirmed/sms', 'agreement.signed/email', 'payment.received/email', 'trip.started/email', 'trip.completed/email', 'booking.cancelled/sms']) {
  ok(events.includes(e), `outbox has ${e}`);
}
const dupes = (await db.query(`select count(*)::int n from (select dedupe_key from notifications_outbox group by 1 having count(*) > 1) x`)).rows[0].n;
ok(dupes === 0, 'no duplicate notifications');

// --- scheduled jobs: unpaid pending older than 30 min is released
await db.exec(`update bookings set created_at = now() - interval '1 hour' where id = '${h.id}'`);
await db.exec(`select run_scheduled_jobs()`);
const expired = (await db.query(`select status, payment_status from bookings where id = $1`, [h.id])).rows[0];
ok(expired.status === 'cancelled' && expired.payment_status === 'failed', 'unpaid booking released after 30 minutes');

// --- fixed-price packages
await as(CUSTOMER);
const iso = (d) => d.toISOString().slice(0, 10);
const friday = iso((await db.query(`select d::date d from generate_series(current_date + 2, current_date + 9, interval '1 day') d where extract(dow from d) = 5 limit 1`)).rows[0].d);
const day = async (base, n) => iso((await db.query(`select $1::date + $2::int d`, [base, n])).rows[0].d);
const pkgCreate = `select * from create_booking('car-range-rover', $1, '10:00 AM', $2, $3, 'loc-1', 'loc-1', $4, '{}', $5::jsonb, 'Paystack', $6, $7)`;
const weekend = (await db.query(pkgCreate, [friday, await day(friday, 3), '10:00 AM', 'day', driver, null, 'pkg-weekend-car-range-rover'])).rows[0];
ok(weekend.base_price === 2200000 && weekend.total_amount === 2376000, `weekend package fixed price → ${weekend.total_amount}`);
ok(weekend.package_name === 'Weekend Escape' && weekend.duration_value === 3, 'package name and duration stored on booking');
await expectError(pkgCreate, [await day(friday, 1), await day(friday, 4), '10:00 AM', 'day', driver, null, 'pkg-weekend-car-range-rover'], /allowed pick-up day/, 'weekend package refused on a Saturday pick-up');
await expectError(pkgCreate, [await day(friday, 7), await day(friday, 11), '10:00 AM', 'day', driver, null, 'pkg-weekend-car-range-rover'], /return time is set/, 'package return must match its duration');
await expectError(pkgCreate, [await day(friday, 7), await day(friday, 10), '10:00 AM', 'day', driver, 'DRIVE20', 'pkg-weekend-car-range-rover'], /Promo codes/, 'promo codes refused on packages');
await expectError(pkgCreate, [await day(friday, 7), await day(friday, 10), '10:00 AM', 'day', driver, null, 'pkg-weekend-car-audi-r8'], /no longer available/, 'package must belong to the car');
const wedding = (await db.query(pkgCreate, [await day(friday, 9), await day(friday, 9), '04:00 PM', 'hour', driver, null, 'pkg-redcarpet-car-range-rover'])).rows[0];
ok(wedding.base_price === 1400000 && wedding.total_amount === 1512000 && wedding.duration_value === 6, `red-carpet 6-hour block → ${wedding.total_amount}`);
await as(STAFF);
await db.query(`select set_booking_status($1, 'confirmed')`, [weekend.id]);
await as(CUSTOMER);
await expectError(`select extend_booking($1, 1)`, [weekend.id], /can’t be extended online/, 'package bookings cannot be extended online');
await db.exec(`set role anon`);
const pubPkgs = (await db.query(`select count(*)::int n from rate_packages`)).rows[0].n;
ok(pubPkgs === 9, `packages are publicly readable (${pubPkgs})`);
const tampered = await db.query(`update rate_packages set price = 1 where id = 'pkg-weekend-car-range-rover'`);
ok(tampered.affectedRows === 0, 'RLS: customer update of a package price affects 0 rows');
await db.exec(`reset role`);
const price = (await db.query(`select price from rate_packages where id = 'pkg-weekend-car-range-rover'`)).rows[0].price;
ok(price === 2200000, 'package price unchanged after customer update attempt');

// --- customer experience: loyalty perks, service recovery, replies, review requests
// Ada has 1 completed trip; complete two more → 3 = Silver (additional driver free).
await db.exec(`update bookings set status = 'completed' where id in ('${weekend.id}', '${wedding.id}')`);
ok((await db.query(`select completed_trips($1) n, loyalty_tier(completed_trips($1)) t`, [CUSTOMER])).rows[0].t === 'silver', 'three completed trips → Silver tier');
await as(CUSTOMER);
const loyal = (await db.query(
  `select * from create_booking('car-bmw-m4', $1, '10:00 AM', $2, '10:00 AM', 'loc-3', 'loc-3', 'day', array['additional-driver', 'insurance-full'], $3::jsonb, 'Paystack')`,
  [await day(friday, 20), await day(friday, 22), driver]
)).rows[0];
// 2 days: base 1,600,000; insurance 25,000×2 = 50,000; additional driver free (Silver); tax 8% of 1,650,000 = 132,000
ok(loyal.extras_total === 50000 && loyal.total_amount === 1782000, `Silver perk: additional driver free, rate unchanged → ${loyal.total_amount}`);
const freeLine = (await db.query(`select price_per_day from booking_extras where booking_id = $1 and service_id = 'additional-driver'`, [loyal.id])).rows[0];
ok(freeLine.price_per_day === 0, 'perk recorded at ₦0 on the booking');
await as(OTHER);
const notLoyal = (await db.query(
  `select * from create_booking('car-g63-amg', $1, '10:00 AM', $2, '10:00 AM', 'loc-3', 'loc-3', 'day', array['additional-driver'], $3::jsonb, 'Paystack')`,
  [await day(friday, 20), await day(friday, 22), driver.replace('Ada Lovelace', 'Bo Smith')]
)).rows[0];
ok(notLoyal.extras_total === 30000, 'new customers pay for the add-on');

// Low rating → follow-up + personal message; review still published
await as(CUSTOMER);
const low = (await db.query(`select * from submit_review($1, 2, 'Car was late and not clean')`, [wedding.id])).rows[0];
ok(low.follow_up === 'open' && low.hidden === false, 'low rating opens a follow-up and stays published');
const apology = (await db.query(`select sender_role, sender_name from messages where booking_id = $1`, [wedding.id])).rows[0];
ok(apology?.sender_role === 'staff' && apology.sender_name === 'Aurevon concierge', 'customer gets a personal message from the team');
ok((await db.query(`select count(*)::int n from notifications_outbox where event = 'staff.review.low'`)).rows[0].n === 1, 'staff alerted about the low rating');
const high = (await db.query(`select follow_up from reviews where booking_id = $1`, [b1.id])).rows[0];
ok(high.follow_up === 'none', 'good ratings need no follow-up');

// Staff reply + resolve
await as(STAFF);
await db.query(`update reviews set staff_reply = 'Sorry — we’ve retrained the delivery team.', follow_up = 'resolved' where id = $1`, [low.id]);
const replied = (await db.query(`select staff_reply_at, follow_up from reviews where id = $1`, [low.id])).rows[0];
ok(replied.staff_reply_at !== null && replied.follow_up === 'resolved', 'staff reply time-stamped and follow-up resolved');
await as(CUSTOMER);
await db.exec(`set role authenticated`);
const forged = await db.query(`update reviews set staff_reply = 'fake reply' where id = $1`, [low.id]);
await db.exec(`reset role`);
ok(forged.affectedRows === 0, 'RLS: customers cannot write staff replies');

// Review request goes out 2 hours after completion, only if no review yet
await db.exec(`set session_replication_role = replica; update bookings set updated_at = now() - interval '3 hours' where id = '${weekend.id}'; set session_replication_role = origin;`);
await db.exec(`select run_cx_jobs()`);
const requests = (await db.query(`select booking_id from notifications_outbox where event = 'review.request'`)).rows.map((r) => r.booking_id);
ok(requests.includes(weekend.id) && !requests.includes(wedding.id) && !requests.includes(b1.id), 'review request sent only for unreviewed trips');
await db.exec(`select run_cx_jobs()`);
ok((await db.query(`select count(*)::int n from notifications_outbox where event = 'review.request' and channel = 'email'`)).rows[0].n === requests.length, 'review requests are not repeated');

// --- customer screening (KYC)
const NEW = '44444444-4444-4444-4444-444444444444';
await db.exec(`insert into auth.users (id, email) values ('${NEW}', 'cy@example.com')`);
await as(NEW);
const cyDriver = driver.replace('Ada Lovelace', 'Cy Young');
await expectError(`select * from create_booking('car-bmw-m4', $1, '10:00 AM', $2, '10:00 AM', 'loc-1', 'loc-1', 'day', '{}', $3::jsonb, 'Paystack')`,
  [await day(friday, 40), await day(friday, 42), cyDriver], /verify your identity/, 'unverified customers cannot book');
const doc = (n) => `${NEW}/${n}.jpg`;
const kyc = {
  dateOfBirth: '1992-05-20',
  licence: { number: 'LAG98765AB', country: 'Nigeria', licenceClass: 'B', expiry: '2030-06-30', frontDoc: doc('lic-front'), backDoc: doc('lic-back') },
  identity: { type: 'national_id', number: '12345678901', expiry: '', doc: doc('nin') },
  selfieDoc: doc('selfie'),
  employment: { type: 'employed', employer: 'Dangote Group', jobTitle: 'Engineer', workEmail: 'cy@dangote.example', corporateAccount: '', doc: doc('letter') },
  record: { convictions: false, accidents: false, suspensions: false, details: '', doc: '' },
  consent: true
};
await expectError(`select submit_verification($1::jsonb)`, [JSON.stringify({ ...kyc, dateOfBirth: '2005-01-01' })], /25 or older/, 'under-25 drivers refused');
await expectError(`select submit_verification($1::jsonb)`, [JSON.stringify({ ...kyc, licence: { ...kyc.licence, expiry: '2020-01-01' } })], /expired/, 'expired licence refused');
await expectError(`select submit_verification($1::jsonb)`, [JSON.stringify({ ...kyc, selfieDoc: `${CUSTOMER}/selfie.jpg` })], /selfie/, 'documents must be in the customer’s own folder');
await expectError(`select submit_verification($1::jsonb)`, [JSON.stringify({ ...kyc, record: { ...kyc.record, accidents: true } })], /record/, 'declared incidents need details');
const submitted = (await db.query(`select * from submit_verification($1::jsonb)`, [JSON.stringify(kyc)])).rows[0];
ok(submitted.status === 'pending' && submitted.checks.licence.status === 'pending', 'verification submitted for review');
const pendingBooking = (await db.query(`select * from create_booking('car-bmw-m4', $1, '10:00 AM', $2, '10:00 AM', 'loc-1', 'loc-1', 'day', '{}', $3::jsonb, 'Paystack')`,
  [await day(friday, 40), await day(friday, 42), cyDriver])).rows[0];
ok(Boolean(pendingBooking.id), 'customers in review can request a booking');
await expectError(`select * from create_booking('car-bmw-m4', $1, '10:00 AM', $2, '10:00 AM', 'loc-1', 'loc-1', 'day', '{}', $3::jsonb, 'Paystack')`,
  ['2030-06-28', '2030-07-02', cyDriver], /expires before the end/, 'licence must be valid through the return date');
await db.exec(`set role authenticated`);
const selfApprove = await db.query(`update customer_verifications set status = 'verified' where customer_id = $1`, [NEW]);
await db.exec(`reset role`);
ok(selfApprove.affectedRows === 0, 'RLS: customers cannot approve themselves');

await as(STAFF);
await expectError(`select set_booking_status($1, 'confirmed')`, [pendingBooking.id], /must be verified/, 'staff cannot confirm an unverified customer');
const approveAll = { licence: { status: 'approved' }, identity: { status: 'approved' }, selfie: { status: 'approved' }, employment: { status: 'approved' }, record: { status: 'approved' } };
await expectError(`select review_verification($1, $2::jsonb, '')`, [NEW, JSON.stringify({ ...approveAll, selfie: { status: 'rejected' } })], /reason/, 'rejections need a reason');
const rejected = (await db.query(`select * from review_verification($1, $2::jsonb, 'Selfie is blurry')`, [NEW, JSON.stringify({ ...approveAll, selfie: { status: 'rejected', reason: 'Too blurry to match the ID' } })])).rows[0];
ok(rejected.status === 'rejected', 'one rejected check → verification rejected');
ok((await db.query(`select count(*)::int n from notifications_outbox where event = 'verification.rejected'`)).rows[0].n === 1, 'customer told what to fix');
await as(NEW);
const resubmitted = (await db.query(`select * from submit_verification($1::jsonb)`, [JSON.stringify({ ...kyc, selfieDoc: doc('selfie-2') })])).rows[0];
ok(resubmitted.checks.licence.status === 'approved' && resubmitted.checks.selfie.status === 'pending', 'resubmitting keeps approved checks');
await as(STAFF);
const verified = (await db.query(`select * from review_verification($1, $2::jsonb, '')`, [NEW, JSON.stringify(approveAll)])).rows[0];
ok(verified.status === 'verified', 'all checks approved → verified');
await db.query(`select set_booking_status($1, 'confirmed')`, [pendingBooking.id]);
ok((await db.query(`select count(*)::int n from audit_log where action = 'verification.reviewed'`)).rows[0].n === 2, 'verification decisions are audited');

// Expiry job
await db.exec(`update customer_verifications set licence = jsonb_set(licence, '{expiry}', '"2020-01-01"') where customer_id = '${NEW}'`);
await db.exec(`select run_screening_jobs()`);
ok((await db.query(`select status from customer_verifications where customer_id = $1`, [NEW])).rows[0].status === 'expired', 'expired licence → verification expires');

// --- deposit settlement after the trip (b1 completed earlier)
await as(CUSTOMER);
await expectError(`select settle_deposit($1, 0, '')`, [b1.id], /Staff only/, 'customers cannot release deposits');
await as(STAFF);
await expectError(`select settle_deposit($1, 900000, 'too much')`, [b1.id], /between/, 'cannot keep more than the deposit');
await expectError(`select settle_deposit($1, 50000, '')`, [b1.id], /reason/, 'keeping part of a deposit needs a reason');
const settled = (await db.query(`select * from settle_deposit($1, 50000, 'Fuel below pick-up level')`, [b1.id])).rows[0];
ok(settled.deposit_status === 'captured' && settled.deposit_captured === 50000, 'deposit settled: ₦50,000 kept with reason');
ok((await db.query(`select count(*)::int n from notifications_outbox where event = 'deposit.captured' and booking_id = $1`, [b1.id])).rows[0].n >= 1, 'customer told how much was kept and why');

// --- electric cars are no longer offered
await expectError(`insert into cars (id, name, brand, year, category, price_per_day, price_per_hour, transmission, fuel_type, seats, doors, image_path) values ('car-ev', 'EV', 'Any', 2025, 'Electric', 800000, 150000, 'Automatic', 'Electric', 5, 4, '/x.jpg')`, [], /cars_no_electric/, 'electric listings are refused');
ok((await db.query("select count(*)::int n from cars where category = 'Electric' or fuel_type = 'Electric'")).rows[0].n === 0, 'no electric cars in the fleet');

console.log(failures ? `\n${failures} FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

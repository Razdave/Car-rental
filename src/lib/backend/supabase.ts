import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Booking, BookingMessage, Car, CarBlock, Customer, CustomerVerification, DepositStatus, ManagementStatus, OutboxMessage,
  PaymentStatus, RatePackage, Review, Role
} from '../../types/car';
import { emptyVerification } from '../verification';
import { AVAILABLE_LOCATIONS, INITIAL_EXTRA_SERVICES, USER_PROFILE } from '../../data/cars';
import { clientStatusFor } from '../api';
import type { Backend, CarInput, Profile } from './types';

/** All bookings, blocks and times are in the business's local time (Lagos, UTC+1, no DST). */
export const BUSINESS_TZ = 'Africa/Lagos';
const BUSINESS_OFFSET = '+01:00';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const locationName = (id: string) => AVAILABLE_LOCATIONS.find((l) => l.id === id)?.name ?? id;
const locationId = (name: string) => AVAILABLE_LOCATIONS.find((l) => l.name === name)?.id ?? name;

function imageUrl(client: SupabaseClient, path: string): string {
  if (!path) return '';
  if (path.startsWith('/') || /^https?:\/\//.test(path)) return path;
  return client.storage.from('car-images').getPublicUrl(path).data.publicUrl;
}

function mapCar(client: SupabaseClient, r: Row): Car {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    model: r.model,
    year: r.year,
    category: r.category,
    pricePerDay: r.price_per_day,
    pricePerHour: r.price_per_hour,
    rating: Number(r.rating),
    reviewCount: r.review_count,
    powerHp: r.power_hp ?? 0,
    acceleration0to100: Number(r.acceleration_0_100 ?? 0),
    topSpeedKmH: r.top_speed_kmh ?? 0,
    transmission: r.transmission,
    fuelType: r.fuel_type,
    seats: r.seats,
    doors: r.doors,
    color: r.color ?? '',
    imageUrl: imageUrl(client, r.image_path),
    galleryImages: (r.gallery_paths?.length ? r.gallery_paths : [r.image_path]).map((p: string) => imageUrl(client, p)),
    description: r.description ?? '',
    features: r.features ?? [],
    location: r.location ?? '',
    isAvailable: r.is_available,
    isPopular: r.is_popular,
    isFeatured: r.is_featured,
    hostName: r.host_name ?? 'Aurevon Fleet',
    hostRating: Number(r.host_rating ?? 5),
    mileageLimit: r.mileage_limit ?? '',
    rules: r.rules ?? [],
    depositAmount: r.deposit_amount ?? undefined,
    packages: (r.rate_packages ?? []).map(mapPackage).sort((a: RatePackage, b: RatePackage) => a.price - b.price)
  };
}

/** Listing editor → cars row. Image URLs from our bucket are stored as paths. */
function carRow(client: SupabaseClient, c: CarInput): Row {
  const bucketPrefix = client.storage.from('car-images').getPublicUrl('').data.publicUrl;
  const path = (u: string) => (u.startsWith(bucketPrefix) ? u.slice(bucketPrefix.length).replace(/^\//, '') : u);
  return {
    name: c.name, brand: c.brand, model: c.model, year: c.year, category: c.category,
    price_per_day: c.pricePerDay, price_per_hour: c.pricePerHour,
    power_hp: c.powerHp, acceleration_0_100: c.acceleration0to100, top_speed_kmh: c.topSpeedKmH,
    transmission: c.transmission, fuel_type: c.fuelType, seats: c.seats, doors: c.doors, color: c.color,
    image_path: path(c.imageUrl), gallery_paths: c.galleryImages.map(path),
    description: c.description, features: c.features, rules: c.rules ?? [], location: c.location,
    is_available: c.isAvailable, is_popular: Boolean(c.isPopular), is_featured: Boolean(c.isFeatured),
    deposit_amount: c.depositAmount ?? null,
    host_name: c.hostName, mileage_limit: c.mileageLimit
  };
}

function mapVerification(r: Row | null, customerId: string): CustomerVerification {
  const base = emptyVerification(customerId);
  if (!r) return base;
  return {
    ...base,
    customerId,
    status: r.status,
    checks: { ...base.checks, ...(r.checks ?? {}) },
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
    reviewerNote: r.reviewer_note,
    dateOfBirth: r.date_of_birth ?? '',
    licence: { ...base.licence, ...(r.licence ?? {}) },
    identity: { ...base.identity, ...(r.identity ?? {}) },
    selfieDoc: r.selfie_doc ?? '',
    employment: { ...base.employment, ...(r.employment ?? {}) },
    record: { ...base.record, ...(r.record ?? {}) },
    consent: Boolean(r.consent)
  };
}

function mapPackage(r: Row): RatePackage {
  return {
    id: r.id, name: r.name, description: r.description ?? '', durationUnit: r.duration_unit, duration: r.duration,
    price: r.price, includes: r.includes ?? [], pickupDays: r.pickup_days ?? [], active: r.active
  };
}

function mapReview(r: Row): Review {
  return {
    id: String(r.id), carId: r.car_id, bookingId: r.booking_id, authorName: r.author_name, rating: r.rating,
    comment: r.comment ?? '', createdAt: r.created_at, hidden: r.hidden,
    staffReply: r.staff_reply ?? null, staffReplyAt: r.staff_reply_at ?? null,
    followUp: r.follow_up ?? 'none', followUpNote: r.follow_up_note ?? null
  };
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

function mapBooking(client: SupabaseClient, r: Row): Booking {
  const status = r.status as ManagementStatus;
  const agreement = one(r.rental_agreements) as Row | null;
  const extraRows: Row[] = r.booking_extras ?? [];
  const extraIds: string[] = extraRows.map((x) => x.service_id);
  const chargedPrice = (id: string, fallback: number) => extraRows.find((x) => x.service_id === id)?.price_per_day ?? fallback;
  const d = r.driver ?? {};
  return {
    id: r.id,
    customerId: r.customer_id,
    carId: r.car_id,
    car: mapCar(client, r.car_snapshot),
    pickupDate: r.pickup_date,
    returnDate: r.return_date,
    pickupTime: r.pickup_time,
    returnTime: r.return_time,
    pickupLocation: locationName(r.pickup_location_id),
    returnLocation: locationName(r.return_location_id),
    durationUnit: r.duration_unit,
    durationValue: r.duration_value,
    totalDays: r.total_days,
    basePrice: r.base_price,
    extraServices: INITIAL_EXTRA_SERVICES.filter((s) => extraIds.includes(s.id)).map((s) => ({ ...s, selected: true, pricePerDay: chargedPrice(s.id, s.pricePerDay) })),
    discount: r.discount,
    taxAmount: r.tax_amount,
    totalAmount: r.total_amount,
    status: clientStatusFor(status),
    managementStatus: status,
    paymentStatus: r.payment_status as PaymentStatus,
    driverInfo: {
      fullName: d.fullName ?? '',
      email: d.email ?? '',
      phone: d.phone ?? '',
      licenseNumber: d.licenseNumber ?? '',
      ageConfirmed: d.ageConfirmed === true
    },
    paymentMethod: r.payment_method,
    packageId: r.package_id ?? null,
    packageName: r.package_name ?? null,
    depositAmount: r.deposit_amount ?? 0,
    depositStatus: (r.deposit_status ?? 'none') as DepositStatus,
    depositCaptured: r.deposit_captured ?? 0,
    depositNote: r.deposit_note ?? null,
    createdAt: r.created_at,
    digitalPassCode: r.pass_code,
    agreement: agreement
      ? { version: agreement.version, signedName: agreement.signed_name, signatureImage: agreement.signature_image, signedAt: agreement.signed_at }
      : null
  };
}

const BOOKING_SELECT = '*, booking_extras(service_id, price_per_day), rental_agreements(version, signed_name, signature_image, signed_at)';

function mapProfile(r: Row, email: string): Profile {
  return {
    ...USER_PROFILE,
    id: r.id,
    fullName: r.full_name || email.split('@')[0],
    email,
    phone: r.phone ?? '',
    licenseNumber: r.licence_number ?? '',
    licenseExpiry: r.licence_expiry ?? '',
    licenseVerified: Boolean(r.licence_verified_at),
    smsOptIn: r.sms_opt_in ?? true,
    notificationsEnabled: r.sms_opt_in ?? true,
    role: r.role as Role,
    memberTier: 'Member',
    totalRentals: 0,
    totalSaved: 0,
    driverRating: 5,
    avatarUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(r.full_name || email)}`,
    joinedDate: `Member since ${new Date(r.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`
  };
}

function mapCustomer(r: Row): Customer {
  return {
    id: r.id,
    fullName: r.full_name ?? '',
    email: r.email ?? '',
    phone: r.phone ?? '',
    licenseNumber: r.licence_number ?? '',
    licenseExpiry: r.licence_expiry ?? '',
    licenseVerified: Boolean(r.licence_verified_at),
    smsOptIn: r.sms_opt_in ?? true,
    notes: r.notes ?? '',
    blocked: Boolean(r.blocked_at),
    role: r.role,
    createdAt: r.created_at
  };
}

/** Timestamps ↔ 'YYYY-MM-DDTHH:mm' in business time, the format CarBlock uses. */
const toWall = (iso: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const fromWall = (wall: string) => `${wall}:00${BUSINESS_OFFSET}`;

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message.replace(/^.*?ERROR:\s*/, ''));
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const client = createClient(url, anonKey, { auth: { persistSession: true, detectSessionInUrl: true } });

  const currentUser = async () => (await client.auth.getUser()).data.user;
  const requireUser = async () => {
    const user = await currentUser();
    if (!user) throw new Error('Please sign in to continue.');
    return user;
  };
  const loadProfile = async (): Promise<Profile | null> => {
    const user = await currentUser();
    if (!user) return null;
    const { data, error } = await client.from('profiles').select('*').eq('id', user.id).single();
    fail(error);
    return mapProfile(data, user.email ?? '');
  };

  const channel = (name: string, tables: Array<{ table: string; filter?: string }>, cb: (payload: Row) => void) => {
    let ch = client.channel(`${name}-${Math.random().toString(36).slice(2)}`);
    for (const t of tables) {
      ch = ch.on('postgres_changes' as never, { event: '*', schema: 'public', table: t.table, filter: t.filter } as never, cb as never);
    }
    ch.subscribe();
    return () => void client.removeChannel(ch);
  };

  const rpcBooking = async (fn: string, args: Row) => {
    const { data, error } = await client.rpc(fn, args);
    fail(error);
    const id = (Array.isArray(data) ? data[0] : data)?.id;
    const { data: row, error: e2 } = await client.from('bookings').select(BOOKING_SELECT).eq('id', id).single();
    fail(e2);
    return mapBooking(client, row);
  };

  return {
    kind: 'supabase',
    isDemo: false,

    getProfile: loadProfile,
    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange(() => {
        void loadProfile().then(cb).catch(() => cb(null));
      });
      return () => data.subscription.unsubscribe();
    },
    async sendSignInCode(email) {
      const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } });
      fail(error);
    },
    async verifySignInCode(email, code) {
      const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
      fail(error);
      const profile = await loadProfile();
      if (!profile) throw new Error('Signed in, but the profile could not be loaded.');
      return profile;
    },
    async signOut() {
      fail((await client.auth.signOut()).error);
    },
    async updateProfile(patch) {
      const user = await requireUser();
      const row: Row = {};
      if (patch.fullName !== undefined) row.full_name = patch.fullName;
      if (patch.phone !== undefined) row.phone = patch.phone;
      if (patch.licenseNumber !== undefined) row.licence_number = patch.licenseNumber;
      if (patch.licenseExpiry !== undefined) row.licence_expiry = patch.licenseExpiry || null;
      if (patch.smsOptIn !== undefined) row.sms_opt_in = patch.smsOptIn;
      if (patch.notificationsEnabled !== undefined) row.sms_opt_in = patch.notificationsEnabled;
      fail((await client.from('profiles').update(row).eq('id', user.id)).error);
      return (await loadProfile())!;
    },

    async listCars() {
      const { data, error } = await client.from('cars').select('*, rate_packages(*)').eq('is_available', true).eq('rate_packages.active', true).order('name');
      fail(error);
      return { cars: data.map((r) => mapCar(client, r)), live: true };
    },
    async unavailableCarIds(w) {
      const { data, error } = await client.rpc('unavailable_car_ids', {
        p_pickup_date: w.pickupDate, p_pickup_time: w.pickupTime, p_return_date: w.returnDate, p_return_time: w.returnTime
      });
      fail(error);
      return (data as string[] | null) ?? [];
    },
    async bookedDays(carId, from, to) {
      const { data, error } = await client.rpc('car_booked_days', { p_car_id: carId, p_from: from, p_to: to });
      fail(error);
      return ((data as string[] | null) ?? []).map((d) => d.slice(0, 10));
    },
    onFleetChange(cb) {
      // `fleet_changes` is a public one-row table bumped by triggers on bookings, blocks and cars,
      // so customers get live availability without being able to read other people's bookings.
      return channel('fleet', [{ table: 'fleet_changes' }, { table: 'cars' }], () => cb());
    },

    async listFavorites() {
      const user = await currentUser();
      if (!user) return [];
      const { data, error } = await client.from('favorites').select('car_id');
      fail(error);
      return data.map((r) => r.car_id);
    },
    async setFavorite(carId, saved) {
      const user = await currentUser();
      if (!user) return;
      const res = saved
        ? await client.from('favorites').upsert({ user_id: user.id, car_id: carId })
        : await client.from('favorites').delete().eq('user_id', user.id).eq('car_id', carId);
      fail(res.error);
    },

    async listMyBookings() {
      const user = await currentUser();
      if (!user) return [];
      const { data, error } = await client.from('bookings').select(BOOKING_SELECT).eq('customer_id', user.id).order('pickup_at', { ascending: false });
      fail(error);
      return data.map((r) => mapBooking(client, r));
    },
    async createBooking(input) {
      await requireUser();
      return rpcBooking('create_booking', {
        p_car_id: input.carId,
        p_pickup_date: input.pickupDate,
        p_pickup_time: input.pickupTime,
        p_return_date: input.returnDate,
        p_return_time: input.returnTime,
        p_pickup_location: locationId(input.pickupLocation),
        p_return_location: locationId(input.returnLocation),
        p_duration_unit: input.durationUnit,
        p_extra_ids: input.extraServiceIds,
        p_driver: input.driverInfo,
        p_payment_method: input.paymentMethod,
        p_promo_code: input.promoCode ?? null,
        p_package_id: input.packageId ?? null
      });
    },
    async startPayment(bookingId, returnUrl) {
      const { data, error } = await client.functions.invoke('payments-init', { body: { bookingId, callbackUrl: returnUrl } });
      if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error ?? 'Could not start the payment.');
      return { redirectUrl: data.authorizationUrl as string, booking: null };
    },
    async verifyPayment(reference) {
      const { error } = await client.functions.invoke('payments-verify', { body: { reference } });
      if (error) throw new Error('We couldn’t confirm the payment yet. It will update automatically once Paystack confirms it.');
    },
    async refreshBooking(b) {
      const { data, error } = await client.from('bookings').select(BOOKING_SELECT).eq('id', b.id).maybeSingle();
      fail(error);
      return data ? mapBooking(client, data) : null;
    },
    cancelBooking: (id) => rpcBooking('cancel_booking', { p_id: id }),
    extendBooking: (id, amount) => rpcBooking('extend_booking', { p_id: id, p_amount: amount }),
    signAgreement: (bookingId, input) =>
      rpcBooking('sign_agreement', {
        p_booking_id: bookingId,
        p_version: input.version,
        p_terms_text: input.termsText,
        p_signed_name: input.signedName,
        p_signature_image: input.signatureImage,
        p_user_agent: navigator.userAgent
      }),
    onMyBookingsChange(cb) {
      return channel('my-bookings', [{ table: 'bookings' }, { table: 'rental_agreements' }, { table: 'customer_verifications' }], () => cb());
    },

    async listMessages() {
      const user = await currentUser();
      if (!user) return [];
      const { data, error } = await client.from('messages').select('*').eq('customer_id', user.id).order('created_at');
      fail(error);
      return data.map(mapMessage);
    },
    async sendMessage(body, bookingId = null) {
      const user = await requireUser();
      const { data, error } = await client
        .from('messages')
        .insert({ customer_id: user.id, booking_id: bookingId, sender_id: user.id, sender_role: 'customer', body: body.trim() })
        .select()
        .single();
      fail(error);
      return mapMessage(data);
    },
    onMessages(cb) {
      return channel('messages', [{ table: 'messages' }], () => cb());
    },

    async getMyVerification() {
      const user = await requireUser();
      const { data, error } = await client.from('customer_verifications').select('*').eq('customer_id', user.id).maybeSingle();
      fail(error);
      return mapVerification(data, user.id);
    },
    async uploadVerificationDoc(file, kind) {
      const user = await requireUser();
      const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      // Private bucket; the first folder must be the user's id (storage policy + submit_verification check).
      const path = `${user.id}/${kind}-${crypto.randomUUID()}.${ext}`;
      fail((await client.storage.from('verification-docs').upload(path, file, { contentType: file.type || 'image/jpeg' })).error);
      return path;
    },
    async submitVerification(v) {
      const user = await requireUser();
      const payload = {
        dateOfBirth: v.dateOfBirth, licence: v.licence, identity: v.identity, selfieDoc: v.selfieDoc,
        employment: v.employment, record: v.record, consent: v.consent
      };
      const { data, error } = await client.rpc('submit_verification', { p: payload });
      fail(error);
      return mapVerification(Array.isArray(data) ? data[0] : data, user.id);
    },
    async verificationDocUrl(ref) {
      if (!ref || ref.startsWith('data:') || /^https?:/.test(ref)) return ref;
      const { data, error } = await client.storage.from('verification-docs').createSignedUrl(ref, 300);
      fail(error);
      return data.signedUrl;
    },
    async startDeposit(bookingId, returnUrl) {
      const { data, error } = await client.functions.invoke('payments-init', { body: { bookingId, callbackUrl: returnUrl, purpose: 'deposit' } });
      if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error ?? 'Could not start the deposit payment.');
      return { redirectUrl: data.authorizationUrl as string, booking: null };
    },

    async listReviews(carId) {
      const { data, error } = await client.from('reviews').select('*').eq('car_id', carId).eq('hidden', false).order('created_at', { ascending: false }).limit(50);
      fail(error);
      return data.map(mapReview);
    },
    async submitReview(bookingId, rating, comment) {
      const { data, error } = await client.rpc('submit_review', { p_booking_id: bookingId, p_rating: rating, p_comment: comment });
      fail(error);
      return mapReview(Array.isArray(data) ? data[0] : data);
    },
    async savePushSubscription(subscription) {
      const user = await currentUser();
      if (!user || !subscription.endpoint) return;
      fail((await client.from('push_subscriptions').upsert({ user_id: user.id, endpoint: subscription.endpoint, subscription }, { onConflict: 'endpoint' })).error);
    },

    admin: {
      async listBookings() {
        const { data, error } = await client.from('bookings').select(BOOKING_SELECT).order('pickup_at', { ascending: false }).limit(500);
        fail(error);
        return data.map((r) => mapBooking(client, r));
      },
      setBookingStatus: (id, status) => rpcBooking('set_booking_status', { p_id: id, p_status: status }),
      markPaid: (id) => rpcBooking('set_payment_status', { p_id: id, p_status: 'paid' }),
      async listCars() {
        const { data, error } = await client.from('cars').select('*, rate_packages(*)').order('name');
        fail(error);
        return data.map((r) => mapCar(client, r));
      },
      async setCarAvailability(carId, available) {
        fail((await client.from('cars').update({ is_available: available }).eq('id', carId)).error);
      },
      async listBlocks() {
        const { data, error } = await client.from('car_blocks').select('*').gte('ends_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('starts_at');
        fail(error);
        return data.map((r) => ({ id: r.id, carId: r.car_id, startsAt: toWall(r.starts_at), endsAt: toWall(r.ends_at), reason: r.reason }));
      },
      async addBlock(block) {
        const { data, error } = await client
          .from('car_blocks')
          .insert({ car_id: block.carId, starts_at: fromWall(block.startsAt), ends_at: fromWall(block.endsAt), reason: block.reason })
          .select()
          .single();
        fail(error);
        return { id: data.id, carId: data.car_id, startsAt: toWall(data.starts_at), endsAt: toWall(data.ends_at), reason: data.reason } as CarBlock;
      },
      async removeBlock(id) {
        fail((await client.from('car_blocks').delete().eq('id', id)).error);
      },
      async listCustomers() {
        const { data, error } = await client.from('profiles').select('*').order('created_at', { ascending: false });
        fail(error);
        return data.map(mapCustomer);
      },
      async updateCustomer(id, patch) {
        const row: Row = {};
        if (patch.notes !== undefined) row.notes = patch.notes;
        if (patch.licenseVerified !== undefined) row.licence_verified_at = patch.licenseVerified ? new Date().toISOString() : null;
        if (patch.blocked !== undefined) row.blocked_at = patch.blocked ? new Date().toISOString() : null;
        const { data, error } = await client.from('profiles').update(row).eq('id', id).select().single();
        fail(error);
        return mapCustomer(data);
      },
      async listOutbox() {
        const { data, error } = await client.from('notifications_outbox').select('*').order('created_at', { ascending: false }).limit(200);
        fail(error);
        return data.map(
          (r): OutboxMessage => ({
            id: String(r.id), bookingId: r.booking_id, event: r.event, channel: r.channel, recipient: r.recipient,
            subject: r.subject, status: r.status, createdAt: r.created_at, error: r.last_error
          })
        );
      },
      async listAllMessages() {
        const { data, error } = await client.from('messages').select('*').order('created_at', { ascending: false }).limit(500);
        fail(error);
        return data.map(mapMessage);
      },
      async saveCar(input) {
        const row = carRow(client, input);
        const res = input.id
          ? await client.from('cars').update(row).eq('id', input.id).select().single()
          : await client.from('cars').insert({ ...row, id: `car-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` }).select().single();
        fail(res.error);
        const carId = res.data.id as string;
        const keep = (input.packages ?? []).map((p) => p.id);
        const del = client.from('rate_packages').delete().eq('car_id', carId);
        fail((await (keep.length ? del.not('id', 'in', `(${keep.map((id) => `"${id}"`).join(',')})`) : del)).error);
        if (input.packages?.length) {
          fail(
            (
              await client.from('rate_packages').upsert(
                input.packages.map((p, i) => ({
                  id: p.id, car_id: carId, name: p.name, description: p.description, duration_unit: p.durationUnit,
                  duration: p.duration, price: p.price, includes: p.includes, pickup_days: p.pickupDays, active: p.active, sort: i
                }))
              )
            ).error
          );
        }
        const { data: full, error: e2 } = await client.from('cars').select('*, rate_packages(*)').eq('id', carId).single();
        fail(e2);
        return mapCar(client, full);
      },
      async uploadCarImage(file) {
        const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${crypto.randomUUID()}.${ext}`;
        fail((await client.storage.from('car-images').upload(path, file, { contentType: file.type || 'image/jpeg', cacheControl: '31536000' })).error);
        return client.storage.from('car-images').getPublicUrl(path).data.publicUrl;
      },
      async listReviews() {
        const { data, error } = await client.from('reviews').select('*').order('created_at', { ascending: false }).limit(300);
        fail(error);
        return data.map(mapReview);
      },
      async setReviewHidden(id, hidden) {
        fail((await client.from('reviews').update({ hidden }).eq('id', id)).error);
      },
      async listVerifications() {
        const { data, error } = await client.from('profiles').select('id, full_name, email, role, customer_verifications(*)').eq('role', 'customer');
        fail(error);
        return data.map((p: Row) => ({
          ...mapVerification(one(p.customer_verifications), p.id),
          customerName: p.full_name || p.email,
          customerEmail: p.email
        }));
      },
      async reviewVerification(customerId, checks, note) {
        // Opening documents is logged server-side; record the review too.
        await client.rpc('log_document_view', { p_customer: customerId });
        const { data, error } = await client.rpc('review_verification', { p_customer: customerId, p_checks: checks, p_note: note });
        fail(error);
        return mapVerification(Array.isArray(data) ? data[0] : data, customerId);
      },
      async settleDeposit(bookingId, captured, note) {
        const { error } = await client.functions.invoke('deposits-settle', { body: { bookingId, captured, note } });
        if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error ?? 'Could not settle the deposit.');
        const { data, error: e2 } = await client.from('bookings').select(BOOKING_SELECT).eq('id', bookingId).single();
        fail(e2);
        return mapBooking(client, data);
      },
      async replyToReview(id, reply) {
        fail((await client.from('reviews').update({ staff_reply: reply.trim() || null }).eq('id', id)).error);
      },
      async setFollowUp(id, status, note) {
        const row: Row = { follow_up: status };
        if (note !== undefined) row.follow_up_note = note;
        fail((await client.from('reviews').update(row).eq('id', id)).error);
      },
      async replyMessage(customerId, body, bookingId = null) {
        const user = await requireUser();
        const { data, error } = await client
          .from('messages')
          .insert({ customer_id: customerId, booking_id: bookingId, sender_id: user.id, sender_role: 'staff', body: body.trim() })
          .select()
          .single();
        fail(error);
        return mapMessage(data);
      },
      onChange(cb) {
        return channel('admin', [{ table: 'bookings' }, { table: 'cars' }, { table: 'car_blocks' }, { table: 'messages' }, { table: 'notifications_outbox' }, { table: 'rental_agreements' }, { table: 'reviews' }, { table: 'customer_verifications' }], () => cb());
      }
    }
  };
}

function mapMessage(r: Row): BookingMessage {
  return {
    id: String(r.id),
    customerId: r.customer_id,
    bookingId: r.booking_id,
    sender: r.sender_role,
    senderName: r.sender_name ?? (r.sender_role === 'staff' ? 'Aurevon concierge' : 'Customer'),
    body: r.body,
    createdAt: r.created_at
  };
}

/**
 * Device-only backend used when Supabase isn't configured. Data lives in localStorage,
 * automated emails/SMS are written to a simulated outbox, and changes are broadcast
 * to other open tabs (so a staff tab and a customer tab stay in sync).
 * If the Express API from `server/` is running, cars and new bookings go through it.
 */
import type {
  Booking, BookingMessage, Car, CarBlock, Customer, CustomerVerification, DepositStatus, ManagementStatus, OutboxMessage,
  PaymentStatus, Review
} from '../../types/car';
import { CARS_DATA, INITIAL_BOOKINGS, INITIAL_EXTRA_SERVICES, USER_PROFILE } from '../../data/cars';
import * as express from '../api';
import { addDays, addHours, getDateTimeMinutes } from '../dates';
import { calculateQuote, PROMO_CODES } from '../pricing';
import { readStored, writeStored } from '../storage';
import { eventsForChange } from './notifications';
import { completedTrips, isFreePerk, loyaltyFor } from '../loyalty';
import { ageOn, depositFor, emptyVerification, MIN_DRIVER_AGE, verificationProblems } from '../verification';
import { isOpenStatus, managementStatusOf, type Backend, type Profile, type TripWindow } from './types';

const K = {
  bookings: 'aurevon.bookings',
  profile: 'aurevon.profile',
  favorites: 'aurevon.favorites',
  carAvailability: 'aurevon.carAvailability',
  blocks: 'aurevon.blocks',
  outbox: 'aurevon.outbox',
  messages: 'aurevon.messages',
  customers: 'aurevon.customerNotes',
  customCars: 'aurevon.customCars',
  reviews: 'aurevon.reviews',
  verifications: 'aurevon.verifications'
} as const;

type Topic = 'bookings' | 'fleet' | 'messages';
const TOPIC_FOR_KEY: Record<string, Topic[]> = {
  [K.bookings]: ['bookings', 'fleet'],
  [K.carAvailability]: ['fleet'],
  [K.blocks]: ['fleet'],
  [K.messages]: ['messages'],
  [K.outbox]: ['bookings'],
  [K.customers]: ['bookings'],
  [K.customCars]: ['fleet'],
  [K.reviews]: ['fleet'],
  [K.verifications]: ['bookings']
};

const bus = new EventTarget();
const emit = (...topics: Topic[]) => topics.forEach((t) => bus.dispatchEvent(new Event(t)));
const on = (topic: Topic, cb: () => void) => {
  bus.addEventListener(topic, cb);
  return () => bus.removeEventListener(topic, cb);
};
if (typeof window !== 'undefined') {
  // Another tab changed localStorage → treat it as a live update here.
  window.addEventListener('storage', (e) => e.key && TOPIC_FOR_KEY[e.key]?.forEach((t) => emit(t)));
}

const save = (key: string, value: unknown) => {
  writeStored(key, value);
  emit(...(TOPIC_FOR_KEY[key] ?? []));
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rid = (len = 6) => Math.random().toString(36).slice(2, 2 + len).toUpperCase();

const loadBookings = (): Booking[] => readStored<Booking[]>(K.bookings, INITIAL_BOOKINGS);
const depositOf = (b: Booking): DepositStatus => b.depositStatus ?? (b.depositAmount ? 'pending' : 'none');

/** The demo driver is an existing, already-screened customer; anyone else starts unverified. */
const loadVerifications = (): Record<string, CustomerVerification> => {
  const stored = readStored<Record<string, CustomerVerification>>(K.verifications, {});
  const me = loadProfile().email.toLowerCase();
  if (!stored[me]) {
    const seeded = emptyVerification(me);
    const approved = { status: 'approved' as const };
    stored[me] = {
      ...seeded,
      status: 'verified',
      checks: { licence: approved, identity: approved, selfie: approved, employment: approved, record: approved },
      submittedAt: '2024-03-01T09:00:00Z',
      reviewedAt: '2024-03-01T12:00:00Z',
      dateOfBirth: '1990-06-14',
      licence: { number: loadProfile().licenseNumber, country: 'Nigeria', licenceClass: 'B', expiry: '2029-11-30', frontDoc: '', backDoc: '' },
      identity: { type: 'passport', number: 'A01234567', expiry: '2031-02-01', doc: '' },
      employment: { ...seeded.employment, employer: 'Harrison & Co.', jobTitle: 'Director' },
      consent: true
    };
  }
  return stored;
};
const myVerification = () => loadVerifications()[loadProfile().email.toLowerCase()];
const verificationOf = (customerId: string) => loadVerifications()[customerId] ?? emptyVerification(customerId);

const paymentOf = (b: Booking): PaymentStatus => b.paymentStatus ?? (b.id.startsWith('BK-') && !b.managementStatus ? 'paid' : 'unpaid');

const loadProfile = (): Profile => ({
  ...USER_PROFILE,
  id: 'local-user',
  role: 'admin',
  licenseVerified: true,
  smsOptIn: true,
  ...readStored<Partial<Profile>>(K.profile, {})
});

let expressLive = false;

/** Write automated messages for a booking change into the simulated outbox. */
function notify(before: Booking | null, after: Booking) {
  const snap = (b: Booking) => ({ status: managementStatusOf(b), paymentStatus: paymentOf(b), signed: Boolean(b.agreement), deposit: depositOf(b) });
  const events = eventsForChange(before ? snap(before) : null, snap(after), after);
  if (!events.length) return;
  const smsOptIn = loadProfile().smsOptIn;
  const outbox = readStored<OutboxMessage[]>(K.outbox, []);
  for (const e of events) {
    for (const channel of e.channels) {
      if (channel === 'sms' && !smsOptIn) continue;
      outbox.unshift({
        id: rid(10),
        bookingId: after.id,
        event: e.event,
        channel,
        recipient: channel === 'email' ? after.driverInfo.email : after.driverInfo.phone,
        subject: e.subject,
        status: 'sent',
        createdAt: new Date().toISOString()
      });
    }
  }
  save(K.outbox, outbox.slice(0, 200));
}

function updateBooking(id: string, change: (b: Booking) => Booking): Booking {
  const list = loadBookings();
  const i = list.findIndex((b) => b.id === id);
  if (i < 0) throw new Error('Booking not found.');
  const before = list[i];
  const after = change(before);
  list[i] = after;
  save(K.bookings, list);
  notify(before, after);
  return after;
}

const windowMinutes = (w: TripWindow) => [getDateTimeMinutes(w.pickupDate, w.pickupTime), getDateTimeMinutes(w.returnDate, w.returnTime)] as const;
const wallMinutes = (wall: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : NaN;
};

function busyCarIds(w: TripWindow, ignoreBookingId?: string): Set<string> {
  const [start, end] = windowMinutes(w);
  const busy = new Set<string>();
  if (start === null || end === null) return busy;
  for (const b of loadBookings()) {
    if (b.id === ignoreBookingId || !isOpenStatus(managementStatusOf(b))) continue;
    const [bs, be] = windowMinutes(b);
    if (bs !== null && be !== null && bs < end && be > start) busy.add(b.carId);
  }
  for (const block of readStored<CarBlock[]>(K.blocks, [])) {
    if (wallMinutes(block.startsAt) < end && wallMinutes(block.endsAt) > start) busy.add(block.carId);
  }
  const overrides = readStored<Record<string, boolean>>(K.carAvailability, {});
  for (const [id, available] of Object.entries(overrides)) if (!available) busy.add(id);
  return busy;
}

const TRANSITIONS: Record<ManagementStatus, ManagementStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

/** Fleet from the API (or bundled), before staff edits; carCache = base + edits + review stats. */
let baseCars: Car[] = CARS_DATA;
let carCache: Car[] = CARS_DATA;

const SEED_REVIEWS: Review[] = [
  { id: 'rv-1', carId: 'car-audi-r8', bookingId: 'BK-30001', authorName: 'Tunde A.', rating: 5, comment: 'Spotless car, delivered on time. The V10 is unreal.', createdAt: '2026-10-02T10:00:00Z', hidden: false },
  { id: 'rv-2', carId: 'car-audi-r8', bookingId: 'BK-30002', authorName: 'Sarah K.', rating: 5, comment: 'Smooth pick-up and very helpful concierge.', createdAt: '2026-09-18T10:00:00Z', hidden: false },
  { id: 'rv-3', carId: 'car-range-rover', bookingId: 'BK-30003', authorName: 'Chidi O.', rating: 5, comment: 'Perfect for a family weekend. Massage seats!', createdAt: '2026-10-21T10:00:00Z', hidden: false },
  { id: 'rv-4', carId: 'car-bmw-m4', bookingId: 'BK-51920', authorName: 'Alex H.', rating: 4, comment: 'Sharp handling and spotless inside. Pick-up took a little longer than expected.', createdAt: '2026-10-17T10:00:00Z', hidden: false }
];
const loadReviews = () => readStored<Review[]>(K.reviews, SEED_REVIEWS);

/** Staff-created or edited listings override the base fleet. */
const withCustomCars = (base: Car[]) => {
  const custom = readStored<Record<string, Car>>(K.customCars, {});
  const reviews = loadReviews().filter((r) => !r.hidden);
  // Cars from the legacy API predate rules/packages, so fall back to the bundled definitions.
  const bundled = (id: string) => CARS_DATA.find((x) => x.id === id);
  const merged = [...base.filter((c) => !custom[c.id]), ...Object.values(custom)].map((c) => ({
    ...c,
    rules: c.rules ?? bundled(c.id)?.rules ?? [],
    packages: c.packages ?? bundled(c.id)?.packages ?? []
  }));
  return merged.map((c) => {
    const mine = reviews.filter((r) => r.carId === c.id && !SEED_REVIEWS.some((x) => x.id === r.id));
    if (!mine.length) return c;
    const total = c.rating * c.reviewCount + mine.reduce((sum, r) => sum + r.rating, 0);
    return { ...c, reviewCount: c.reviewCount + mine.length, rating: Math.round((total / (c.reviewCount + mine.length)) * 100) / 100 };
  });
};

/** Downscale photos before storing them on the device (keeps localStorage small). */
const resizeImage = (file: Blob, max = 1280) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('That file isn’t an image we can read.'));
    img.src = URL.createObjectURL(file);
  });

function addMessage(m: Omit<BookingMessage, 'id' | 'createdAt'>): BookingMessage {
  const message: BookingMessage = { ...m, body: m.body.trim(), id: rid(10), createdAt: new Date().toISOString() };
  save(K.messages, [...readStored<BookingMessage[]>(K.messages, []), message]);
  return message;
}

export const localBackend: Backend = {
  kind: 'local',
  isDemo: true,

  async getProfile() {
    return loadProfile();
  },
  onAuthChange() {
    return () => {};
  },
  async sendSignInCode() {
    /* always signed in on the device demo */
  },
  async verifySignInCode() {
    return loadProfile();
  },
  async signOut() {
    /* no accounts on the device demo */
  },
  async updateProfile(patch) {
    const next = { ...readStored<Partial<Profile>>(K.profile, {}), ...patch };
    writeStored(K.profile, next);
    return loadProfile();
  },

  async listCars() {
    try {
      baseCars = await express.fetchCars();
      expressLive = true;
    } catch {
      baseCars = CARS_DATA;
      expressLive = false;
    }
    carCache = withCustomCars(baseCars);
    const overrides = readStored<Record<string, boolean>>(K.carAvailability, {});
    return { cars: carCache.filter((c) => overrides[c.id] !== false), live: expressLive };
  },
  async unavailableCarIds(w) {
    return [...busyCarIds(w)];
  },
  async bookedDays(carId, from, to) {
    const days: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (busyCarIds({ pickupDate: d, pickupTime: '12:00 AM', returnDate: addDays(d, 1), returnTime: '12:00 AM' }).has(carId)) days.push(d);
    }
    return days;
  },
  onFleetChange(cb) {
    return on('fleet', cb);
  },

  async listFavorites() {
    return readStored<string[]>(K.favorites, ['car-audi-r8', 'car-range-rover']);
  },
  async setFavorite(carId, saved) {
    const list = readStored<string[]>(K.favorites, ['car-audi-r8', 'car-range-rover']).filter((id) => id !== carId);
    writeStored(K.favorites, saved ? [...list, carId] : list);
  },

  async listMyBookings() {
    return loadBookings();
  },

  async createBooking(input) {
    const car = carCache.find((c) => c.id === input.carId) ?? CARS_DATA.find((c) => c.id === input.carId);
    if (!car) throw new Error('This vehicle is not currently available.');
    const v = myVerification();
    if (v.status !== 'pending' && v.status !== 'verified') throw new Error('Please verify your identity before booking.');
    if (v.licence.expiry && v.licence.expiry < input.returnDate) throw new Error('Your driving licence expires before the end of this trip.');
    if (busyCarIds(input).has(car.id)) throw new Error('Sorry — this car was just booked for those dates. Please pick other dates or another car.');

    const pkg = input.packageId ? (car.packages ?? []).find((p) => p.id === input.packageId && p.active) : null;
    if (input.packageId && !pkg) throw new Error('This package is no longer available.');
    if (pkg && input.promoCode) throw new Error('Promo codes can’t be used with package prices.');

    let booking: Booking;
    // The legacy Express API doesn't know about packages, so package bookings stay on the device.
    if (expressLive && !pkg) {
      booking = await express.createBooking({ ...input, extraServices: input.extraServiceIds.map((id) => ({ id })) });
      booking = { ...booking, paymentStatus: 'unpaid', depositAmount: depositFor(car), depositStatus: 'pending', depositCaptured: 0 };
    } else {
      await wait(500);
      // Loyalty perks: some add-ons are included free for repeat customers (rates themselves never drop).
      const { tier } = loyaltyFor(completedTrips(loadBookings()));
      const extras = INITIAL_EXTRA_SERVICES.filter((s) => input.extraServiceIds.includes(s.id)).map((s) => ({
        ...s,
        selected: true,
        pricePerDay: isFreePerk(tier, s.id) ? 0 : s.pricePerDay
      }));
      const quote = calculateQuote({ ...input, car, extras, pkg });
      if (quote.error) throw new Error(quote.error);
      const promo = input.promoCode ? PROMO_CODES[input.promoCode] : undefined;
      if (input.promoCode && !promo) throw new Error('The promo code is invalid.');
      const discount = promo ? promo.discount(quote.totalAmount) : 0;
      booking = {
        id: `DEMO-${rid(5)}`,
        carId: car.id,
        car,
        pickupDate: input.pickupDate,
        returnDate: input.returnDate,
        pickupTime: input.pickupTime,
        returnTime: input.returnTime,
        pickupLocation: input.pickupLocation,
        returnLocation: input.returnLocation,
        durationUnit: input.durationUnit,
        durationValue: quote.durationValue,
        totalDays: quote.totalDays,
        basePrice: quote.basePrice,
        extraServices: extras,
        discount,
        taxAmount: quote.taxAmount,
        totalAmount: Math.max(0, quote.totalAmount - discount),
        status: 'upcoming',
        managementStatus: 'pending',
        paymentStatus: 'unpaid',
        driverInfo: input.driverInfo,
        paymentMethod: input.paymentMethod,
        createdAt: new Date().toISOString(),
        digitalPassCode: `PASS-${rid()}`,
        agreement: null,
        packageId: pkg?.id ?? null,
        packageName: pkg?.name ?? null,
        depositAmount: depositFor(car),
        depositStatus: 'pending',
        depositCaptured: 0,
        depositNote: null
      };
    }
    save(K.bookings, [booking, ...loadBookings().filter((b) => b.id !== booking.id)]);
    notify(null, booking);
    return booking;
  },

  async startPayment(bookingId) {
    await wait(900);
    const booking = updateBooking(bookingId, (b) => ({ ...b, paymentStatus: 'paid' }));
    return { redirectUrl: null, booking };
  },
  async verifyPayment() {
    /* payments are settled immediately on the device demo */
  },

  async refreshBooking(b) {
    if (!expressLive || b.id.startsWith('DEMO-') || !b.managementStatus || b.managementStatus === 'cancelled') return null;
    const status = await express.fetchBookingStatus(b.id, b.driverInfo.email);
    if (status === b.managementStatus) return null;
    return updateBooking(b.id, (x) => ({ ...x, managementStatus: status, status: express.clientStatusFor(status) }));
  },

  async cancelBooking(id) {
    return updateBooking(id, (b) => {
      if (!isOpenStatus(managementStatusOf(b)) || managementStatusOf(b) === 'active') throw new Error('This booking can no longer be cancelled.');
      return { ...b, status: 'cancelled', managementStatus: 'cancelled', paymentStatus: paymentOf(b) === 'paid' ? 'refunded' : paymentOf(b) };
    });
  },

  async extendBooking(id, amount) {
    const current = loadBookings().find((b) => b.id === id);
    if (!current) throw new Error('Booking not found.');
    if (current.packageId) throw new Error('Package bookings can’t be extended online — message us and we’ll arrange extra time.');
    const unit = current.durationUnit ?? 'day';
    const next = unit === 'day' ? { date: addDays(current.returnDate, amount), time: current.returnTime } : addHours(current.returnDate, current.returnTime, amount);
    const extension = { pickupDate: current.returnDate, pickupTime: current.returnTime, returnDate: next.date, returnTime: next.time };
    if (busyCarIds(extension, id).has(current.carId)) throw new Error('The car is booked straight after your trip, so it can’t be extended. Contact us for an alternative.');
    return updateBooking(id, (b) => {
      const quote = calculateQuote({ car: b.car, durationUnit: unit, pickupDate: b.pickupDate, pickupTime: b.pickupTime, returnDate: next.date, returnTime: next.time, extras: b.extraServices });
      return {
        ...b,
        returnDate: next.date,
        returnTime: next.time,
        durationValue: quote.durationValue,
        totalDays: quote.totalDays,
        basePrice: quote.basePrice,
        taxAmount: quote.taxAmount,
        totalAmount: Math.max(0, quote.totalAmount - b.discount)
      };
    });
  },

  async signAgreement(bookingId, input) {
    return updateBooking(bookingId, (b) => ({
      ...b,
      agreement: { version: input.version, signedName: input.signedName, signatureImage: input.signatureImage, signedAt: new Date().toISOString() }
    }));
  },
  onMyBookingsChange(cb) {
    return on('bookings', cb);
  },

  async listMessages() {
    const me = loadProfile().email.toLowerCase();
    return readStored<BookingMessage[]>(K.messages, []).filter((m) => m.customerId === me);
  },
  async sendMessage(body, bookingId = null) {
    const profile = loadProfile();
    return addMessage({ customerId: profile.email.toLowerCase(), bookingId, sender: 'customer', senderName: profile.fullName, body });
  },
  onMessages(cb) {
    return on('messages', cb);
  },

  async listReviews(carId) {
    return loadReviews().filter((r) => r.carId === carId && !r.hidden).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async submitReview(bookingId, rating, comment) {
    const booking = loadBookings().find((b) => b.id === bookingId);
    if (!booking || managementStatusOf(booking) !== 'completed') throw new Error('You can review a car after your trip is completed.');
    if (loadReviews().some((r) => r.bookingId === bookingId)) throw new Error('You’ve already reviewed this trip.');
    const review: Review = {
      id: rid(8), carId: booking.carId, bookingId, rating: Math.min(5, Math.max(1, Math.round(rating))),
      comment: comment.trim(), authorName: `${booking.driverInfo.fullName.split(' ')[0]} ${booking.driverInfo.fullName.split(' ')[1]?.[0] ?? ''}.`.trim(),
      createdAt: new Date().toISOString(), hidden: false,
      followUp: rating <= 3 ? 'open' : 'none', staffReply: null, followUpNote: null
    };
    save(K.reviews, [review, ...loadReviews()]);
    // Service recovery: a low rating opens a follow-up for staff and a personal message to the customer.
    // The review is still published — low ratings are never hidden from other customers.
    if (rating <= 3) {
      addMessage({
        customerId: loadProfile().email.toLowerCase(),
        bookingId,
        sender: 'staff',
        senderName: 'Aurevon concierge',
        body: `We’re sorry your trip in the ${booking.car.name} wasn’t what you expected. A manager will contact you within one working day to put it right — feel free to reply here with any details.`
      });
      const outbox = readStored<OutboxMessage[]>(K.outbox, []);
      outbox.unshift({
        id: rid(10), bookingId, event: 'staff.review.low', channel: 'email', recipient: 'ops@aurevon.example',
        subject: `[Staff] ${rating}★ review on ${booking.car.name} — follow up`, status: 'sent', createdAt: new Date().toISOString()
      });
      save(K.outbox, outbox);
    }
    carCache = withCustomCars(baseCars);
    return review;
  },
  async getMyVerification() {
    return myVerification();
  },
  async uploadVerificationDoc(file) {
    return resizeImage(file, 1400);
  },
  async submitVerification(v) {
    const problems = verificationProblems(v);
    if (Object.keys(problems).length) throw new Error(Object.values(problems)[0]!);
    const me = loadProfile().email.toLowerCase();
    const all = loadVerifications();
    const prev = all[me];
    // Re-submitting resets only checks that weren't already approved.
    const checks = Object.fromEntries(
      (Object.keys(v.checks) as Array<keyof typeof v.checks>).map((k) => [
        k,
        prev?.checks[k]?.status === 'approved' && prev.status !== 'expired' ? prev.checks[k] : { status: 'pending' }
      ])
    ) as CustomerVerification['checks'];
    const next: CustomerVerification = { ...v, customerId: me, status: 'pending', checks, submittedAt: new Date().toISOString(), reviewedAt: null };
    save(K.verifications, { ...all, [me]: next });
    return next;
  },
  async verificationDocUrl(ref) {
    return ref;
  },
  async startDeposit(bookingId) {
    await wait(800);
    const booking = updateBooking(bookingId, (b) => ({ ...b, depositStatus: 'held' }));
    return { redirectUrl: null, booking };
  },

  async savePushSubscription() {
    /* device demo shows notifications locally; nothing to store */
  },

  admin: {
    async listBookings() {
      return loadBookings();
    },
    async setBookingStatus(id, status) {
      return updateBooking(id, (b) => {
        const from = managementStatusOf(b);
        if (!TRANSITIONS[from].includes(status)) throw new Error(`Can’t change a ${from} booking to ${status}.`);
        if (status === 'confirmed' && busyCarIds(b, b.id).has(b.carId)) throw new Error('The car isn’t available for this booking’s dates.');
        if (status === 'confirmed' && verificationOf(b.driverInfo.email.toLowerCase()).status !== 'verified')
          throw new Error('The customer must be verified before this booking can be confirmed (Verification tab).');
        if (status === 'active' && !['held', 'none'].includes(depositOf(b))) throw new Error('The security deposit must be held before the trip can start.');
        if (status === 'active' && !b.agreement) throw new Error('The customer must sign the rental agreement before the trip can start.');
        if (status === 'active' && paymentOf(b) !== 'paid') throw new Error('Payment must be received before the trip can start.');
        return {
          ...b,
          managementStatus: status,
          status: express.clientStatusFor(status),
          paymentStatus: status === 'cancelled' && paymentOf(b) === 'paid' ? 'refunded' : paymentOf(b)
        };
      });
    },
    async markPaid(id) {
      return updateBooking(id, (b) => ({ ...b, paymentStatus: 'paid' }));
    },
    async listCars() {
      const overrides = readStored<Record<string, boolean>>(K.carAvailability, {});
      return carCache.map((c) => ({ ...c, isAvailable: overrides[c.id] ?? c.isAvailable }));
    },
    async setCarAvailability(carId, available) {
      save(K.carAvailability, { ...readStored<Record<string, boolean>>(K.carAvailability, {}), [carId]: available });
    },
    async listBlocks() {
      return readStored<CarBlock[]>(K.blocks, []);
    },
    async addBlock(block) {
      if (!(wallMinutes(block.endsAt) > wallMinutes(block.startsAt))) throw new Error('The block must end after it starts.');
      const created = { ...block, id: rid(8) };
      save(K.blocks, [...readStored<CarBlock[]>(K.blocks, []), created]);
      return created;
    },
    async removeBlock(id) {
      save(K.blocks, readStored<CarBlock[]>(K.blocks, []).filter((b) => b.id !== id));
    },
    async listCustomers() {
      const notes = readStored<Record<string, Partial<Customer>>>(K.customers, {});
      const profile = loadProfile();
      const byEmail = new Map<string, Customer>();
      const add = (c: Customer) => byEmail.set(c.email.toLowerCase(), { ...c, ...notes[c.email.toLowerCase()] });
      add({
        id: profile.email.toLowerCase(), fullName: profile.fullName, email: profile.email, phone: profile.phone,
        licenseNumber: profile.licenseNumber, licenseExpiry: profile.licenseExpiry, licenseVerified: profile.licenseVerified,
        smsOptIn: profile.smsOptIn, notes: '', blocked: false, role: 'customer', createdAt: '2024-03-01T00:00:00Z'
      });
      for (const b of loadBookings()) {
        const email = b.driverInfo.email.toLowerCase();
        if (byEmail.has(email)) continue;
        add({
          id: email, fullName: b.driverInfo.fullName, email: b.driverInfo.email, phone: b.driverInfo.phone,
          licenseNumber: b.driverInfo.licenseNumber, licenseExpiry: '', licenseVerified: false, smsOptIn: true,
          notes: '', blocked: false, role: 'customer', createdAt: b.createdAt
        });
      }
      return [...byEmail.values()];
    },
    async updateCustomer(id, patch) {
      const notes = readStored<Record<string, Partial<Customer>>>(K.customers, {});
      notes[id] = { ...notes[id], ...patch };
      save(K.customers, notes);
      const updated = (await localBackend.admin.listCustomers()).find((c) => c.id === id);
      if (!updated) throw new Error('Customer not found.');
      return updated;
    },
    async listOutbox() {
      return readStored<OutboxMessage[]>(K.outbox, []);
    },
    async listAllMessages() {
      return readStored<BookingMessage[]>(K.messages, []);
    },
    async replyMessage(customerId, body, bookingId = null) {
      return addMessage({ customerId, bookingId, sender: 'staff', senderName: 'Aurevon concierge', body });
    },
    async saveCar(input) {
      const existing = input.id ? carCache.find((c) => c.id === input.id) : undefined;
      const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const id = input.id ?? `car-${slug || rid(6).toLowerCase()}`;
      if (!input.id && carCache.some((c) => c.id === id)) throw new Error('A car with that name already exists.');
      const car: Car = { rating: 5, reviewCount: 0, hostRating: 5, ...existing, ...input, id };
      save(K.customCars, { ...readStored<Record<string, Car>>(K.customCars, {}), [id]: car });
      carCache = withCustomCars(baseCars);
      return car;
    },
    async uploadCarImage(file) {
      return resizeImage(file);
    },
    async listReviews() {
      return loadReviews();
    },
    async setReviewHidden(id, hidden) {
      save(K.reviews, loadReviews().map((r) => (r.id === id ? { ...r, hidden } : r)));
    },
    async listVerifications() {
      const customers = await localBackend.admin.listCustomers();
      const all = loadVerifications();
      return customers.map((c) => ({ ...(all[c.id] ?? emptyVerification(c.id)), customerName: c.fullName, customerEmail: c.email }));
    },
    async reviewVerification(customerId, checks, note) {
      const all = loadVerifications();
      const v = all[customerId];
      if (!v || !v.submittedAt) throw new Error('This customer hasn’t submitted verification yet.');
      const allApproved = Object.values(checks).every((c) => c.status === 'approved');
      if (allApproved && ageOn(v.dateOfBirth) < MIN_DRIVER_AGE) throw new Error(`The driver is under ${MIN_DRIVER_AGE} — verification can’t be approved.`);
      if (allApproved && v.licence.expiry <= new Date().toISOString().slice(0, 10)) throw new Error('The driving licence has expired.');
      const next: CustomerVerification = {
        ...v,
        checks: Object.fromEntries(Object.entries(checks).map(([k, c]) => [k, { status: c.status, reason: c.reason ?? null }])) as CustomerVerification['checks'],
        status: allApproved ? 'verified' : Object.values(checks).some((c) => c.status === 'rejected') ? 'rejected' : 'pending',
        reviewedAt: new Date().toISOString(),
        reviewerNote: note || null
      };
      save(K.verifications, { ...all, [customerId]: next });
      if (next.status === 'verified' || next.status === 'rejected') {
        const outbox = readStored<OutboxMessage[]>(K.outbox, []);
        outbox.unshift({
          id: rid(10), bookingId: null, event: `verification.${next.status === 'verified' ? 'approved' : 'rejected'}`, channel: 'email',
          recipient: customerId, subject: next.status === 'verified' ? 'You’re verified — ready to drive' : 'We need a little more information to verify you',
          status: 'sent', createdAt: new Date().toISOString()
        });
        save(K.outbox, outbox);
      }
      if (allApproved) {
        const notes = readStored<Record<string, Partial<Customer>>>(K.customers, {});
        save(K.customers, { ...notes, [customerId]: { ...notes[customerId], licenseVerified: true } });
      }
      return next;
    },
    async settleDeposit(bookingId, captured, note) {
      return updateBooking(bookingId, (b) => {
        const amount = b.depositAmount ?? 0;
        if (depositOf(b) !== 'held') throw new Error('Only a held deposit can be released.');
        if (managementStatusOf(b) === 'active') throw new Error('Complete the trip before releasing the deposit.');
        if (captured < 0 || captured > amount) throw new Error('The amount kept must be between ₦0 and the deposit.');
        if (captured > 0 && note.trim().length < 5) throw new Error('Give the reason for keeping part of the deposit.');
        return { ...b, depositStatus: captured > 0 ? 'captured' : 'released', depositCaptured: captured, depositNote: note.trim() || null };
      });
    },
    async replyToReview(id, reply) {
      const text = reply.trim();
      save(K.reviews, loadReviews().map((r) => (r.id === id ? { ...r, staffReply: text || null, staffReplyAt: text ? new Date().toISOString() : null } : r)));
    },
    async setFollowUp(id, status, note) {
      save(K.reviews, loadReviews().map((r) => (r.id === id ? { ...r, followUp: status, followUpNote: note ?? r.followUpNote ?? null } : r)));
    },
    onChange(cb) {
      const offs = (['bookings', 'fleet', 'messages'] as Topic[]).map((t) => on(t, cb));
      return () => offs.forEach((off) => off());
    }
  }
};

import type { Booking, Car, DriverInfo, ExtraService, RatePackage } from '../types/car';
import { addDays, addHours, getDateTimeMinutes } from './dates';

export type DurationUnit = 'day' | 'hour';

export const TAX_RATE = 0.08;

export interface QuoteInput {
  car: Car;
  durationUnit: DurationUnit;
  pickupDate: string;
  returnDate: string;
  pickupTime: string;
  returnTime: string;
  extras: ExtraService[];
  /** Book as a fixed-price package: base price = package price, return = pick-up + package duration. */
  pkg?: RatePackage | null;
}

export interface Quote {
  totalDays: number;
  totalHours: number;
  durationValue: number;
  unitPrice: number;
  basePrice: number;
  extrasTotal: number;
  taxAmount: number;
  totalAmount: number;
  /** Null when the dates/times form a valid rental period. */
  error: string | null;
}

/** Mirrors the server's pricing in server/index.ts so the client shows the same total the API will charge. */
export function calculateQuote(input: QuoteInput): Quote {
  if (input.pkg) return calculatePackageQuote(input, input.pkg);
  const { car, durationUnit, pickupDate, returnDate, pickupTime, returnTime, extras } = input;
  const dayDiff = Math.ceil(
    (Date.parse(`${returnDate}T00:00:00.000Z`) - Date.parse(`${pickupDate}T00:00:00.000Z`)) / 86400000
  );
  const totalDays = Number.isFinite(dayDiff) ? Math.max(1, dayDiff) : 1;
  const start = getDateTimeMinutes(pickupDate, pickupTime);
  const end = getDateTimeMinutes(returnDate, returnTime);
  const minutes = start !== null && end !== null ? end - start : 0;
  const totalHours = minutes > 0 ? Math.max(1, Math.ceil(minutes / 60)) : 1;

  let error: string | null = null;
  if (minutes <= 0) error = 'Return must be after pick-up.';
  else if (durationUnit === 'day' && returnDate <= pickupDate) error = 'A daily rental needs a return date after the pick-up date.';

  const durationValue = durationUnit === 'hour' ? totalHours : totalDays;
  const unitPrice = durationUnit === 'hour' ? car.pricePerHour : car.pricePerDay;
  const basePrice = unitPrice * durationValue;
  const extrasTotal = extras.reduce(
    (sum, s) => sum + (durationUnit === 'hour' ? Math.round((s.pricePerDay * totalHours) / 24) : s.pricePerDay * totalDays),
    0
  );
  const taxAmount = Math.round((basePrice + extrasTotal) * TAX_RATE);
  return {
    totalDays,
    totalHours,
    durationValue,
    unitPrice,
    basePrice,
    extrasTotal,
    taxAmount,
    totalAmount: basePrice + extrasTotal + taxAmount,
    error
  };
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

/** Return date/time implied by a package that starts at the given pick-up. */
export const packageReturn = (pkg: RatePackage, pickupDate: string, pickupTime: string) =>
  pkg.durationUnit === 'day' ? { date: addDays(pickupDate, pkg.duration), time: pickupTime } : addHours(pickupDate, pickupTime, pkg.duration);

export const packageDurationLabel = (pkg: RatePackage) => durationLabel(pkg.duration, pkg.durationUnit);

export const packagePickupLabel = (pkg: RatePackage) =>
  pkg.pickupDays.length === 0 || pkg.pickupDays.length === 7 ? 'Any day' : `Pick-up ${pkg.pickupDays.map((d) => WEEKDAYS[d]).join(' or ')}`;

/** Mirrors the package branch of create_booking() in the database. */
function calculatePackageQuote(input: QuoteInput, pkg: RatePackage): Quote {
  const totalHours = pkg.durationUnit === 'hour' ? pkg.duration : pkg.duration * 24;
  const totalDays = pkg.durationUnit === 'day' ? pkg.duration : Math.max(1, Math.ceil(pkg.duration / 24));
  const extrasTotal = input.extras.reduce(
    (sum, s) => sum + (pkg.durationUnit === 'hour' ? Math.round((s.pricePerDay * totalHours) / 24) : s.pricePerDay * totalDays),
    0
  );
  const taxAmount = Math.round((pkg.price + extrasTotal) * TAX_RATE);
  const expected = packageReturn(pkg, input.pickupDate, input.pickupTime);
  let error: string | null = null;
  if (!pkg.active) error = 'This package is no longer available.';
  else if (pkg.pickupDays.length && !pkg.pickupDays.includes(weekdayOf(input.pickupDate)))
    error = `${pkg.name} starts on ${pkg.pickupDays.map((d) => WEEKDAYS[d]).join(' or ')} — choose a matching pick-up date.`;
  else if (expected.date !== input.returnDate || expected.time !== input.returnTime) error = 'The return time is set by the package.';
  return {
    totalDays,
    totalHours,
    durationValue: pkg.duration,
    unitPrice: pkg.price,
    basePrice: pkg.price,
    extrasTotal,
    taxAmount,
    totalAmount: pkg.price + extrasTotal + taxAmount,
    error
  };
}

export const extraUnitPrice = (service: ExtraService, unit: DurationUnit) =>
  unit === 'hour' ? Math.round(service.pricePerDay / 24) : service.pricePerDay;

export const durationLabel = (value: number, unit: DurationUnit) =>
  `${value} ${unit === 'hour' ? (value === 1 ? 'hour' : 'hours') : value === 1 ? 'day' : 'days'}`;

export const bookingDurationLabel = (b: Booking) =>
  (b.packageName ? `${b.packageName} · ` : '') + durationLabel(b.durationValue ?? b.totalDays, b.durationUnit ?? 'day');

/** Client-side promo preview. The API re-validates and recalculates the discount. */
export const PROMO_CODES: Record<string, { label: string; discount: (total: number) => number }> = {
  DRIVE20: { label: '20% off your rental', discount: (total) => Math.round(total * 0.2) },
  VIP10: { label: '₦50,000 off', discount: () => 50000 }
};

export interface BookingDraft {
  car: Car;
  pickupDate: string;
  returnDate: string;
  pickupTime: string;
  returnTime: string;
  pickupLocation: string;
  returnLocation: string;
  durationUnit: DurationUnit;
  durationValue: number;
  totalDays: number;
  basePrice: number;
  extraServices: ExtraService[];
  taxAmount: number;
  totalAmount: number;
  driverInfo: DriverInfo;
  packageId?: string | null;
  packageName?: string | null;
}

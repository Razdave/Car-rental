import type { Booking, Car, DriverInfo, ExtraService } from '../types/car';
import { getDateTimeMinutes } from './dates';

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

export const extraUnitPrice = (service: ExtraService, unit: DurationUnit) =>
  unit === 'hour' ? Math.round(service.pricePerDay / 24) : service.pricePerDay;

export const durationLabel = (value: number, unit: DurationUnit) =>
  `${value} ${unit === 'hour' ? (value === 1 ? 'hour' : 'hours') : value === 1 ? 'day' : 'days'}`;

export const bookingDurationLabel = (b: Booking) =>
  durationLabel(b.durationValue ?? b.totalDays, b.durationUnit ?? 'day');

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
}

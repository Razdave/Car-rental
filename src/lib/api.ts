/**
 * Data access layer. Every network call the UI makes goes through this file,
 * so moving from the Express API to Supabase only changes the implementations here.
 */
import type { Booking, Car, DriverInfo, ExtraService } from '../types/car';
import type { DurationUnit } from './pricing';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body: unknown = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === 'string' ? body.error : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

export async function fetchCars(): Promise<Car[]> {
  const cars = await request<unknown>('/api/cars');
  if (!Array.isArray(cars)) throw new Error('Fleet API returned an invalid response.');
  return cars as Car[];
}

export interface CreateBookingInput {
  carId: string;
  pickupDate: string;
  returnDate: string;
  pickupTime: string;
  returnTime: string;
  pickupLocation: string;
  returnLocation: string;
  durationUnit: DurationUnit;
  extraServices: Pick<ExtraService, 'id'>[];
  driverInfo: DriverInfo;
  paymentMethod: string;
  promoCode?: string;
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const booking = await request<unknown>('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (
    !isRecord(booking) ||
    typeof booking.id !== 'string' ||
    !isRecord(booking.car) ||
    typeof booking.totalAmount !== 'number'
  ) {
    throw new Error('The booking service returned an invalid response.');
  }
  return booking as unknown as Booking;
}

export type ManagementStatus = NonNullable<Booking['managementStatus']>;

const MANAGEMENT_STATUSES: ManagementStatus[] = ['pending', 'confirmed', 'active', 'completed', 'cancelled'];

export async function fetchBookingStatus(bookingId: string, email: string): Promise<ManagementStatus> {
  const result = await request<unknown>(`/api/bookings/${encodeURIComponent(bookingId)}/status`, {
    headers: { 'X-Booking-Email': email }
  });
  if (!isRecord(result) || !MANAGEMENT_STATUSES.includes(result.managementStatus as ManagementStatus)) {
    throw new Error('Booking status response is invalid.');
  }
  return result.managementStatus as ManagementStatus;
}

export const clientStatusFor = (status: ManagementStatus): Booking['status'] =>
  status === 'pending' || status === 'confirmed' ? 'upcoming' : status;

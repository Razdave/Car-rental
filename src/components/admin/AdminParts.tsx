import React from 'react';
import type { Booking, ManagementStatus, PaymentStatus } from '../../types/car';
import { managementStatusOf } from '../../lib/backend';
import { getDateTimeMinutes, todayISO } from '../../lib/dates';
import { cn } from '../ui/Button';

export const STATUS_STYLE: Record<ManagementStatus, string> = {
  pending: 'bg-amber-50 text-amber-800',
  confirmed: 'bg-sky-50 text-sky-700',
  active: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-surface-2 text-ink-muted',
  cancelled: 'bg-brand-soft text-brand'
};

export const Pill: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={cn('inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold capitalize', className)}>{children}</span>
);

export const StatusPill: React.FC<{ booking: Booking }> = ({ booking }) => {
  const s = managementStatusOf(booking);
  return <Pill className={STATUS_STYLE[s]}>{s}</Pill>;
};

const PAY_STYLE: Record<PaymentStatus, string> = {
  unpaid: 'bg-amber-50 text-amber-800',
  authorized: 'bg-sky-50 text-sky-700',
  paid: 'bg-emerald-50 text-emerald-700',
  refunded: 'bg-surface-2 text-ink-muted',
  failed: 'bg-brand-soft text-brand'
};

export const PaymentPill: React.FC<{ booking: Booking }> = ({ booking }) => {
  const p = booking.paymentStatus ?? 'paid';
  return <Pill className={PAY_STYLE[p]}>{p}</Pill>;
};

export const DepositPill: React.FC<{ booking: Booking }> = ({ booking }) => {
  const s = booking.depositStatus ?? 'none';
  if (s === 'none') return null;
  const style = { pending: 'bg-amber-50 text-amber-800', held: 'bg-sky-50 text-sky-700', released: 'bg-surface-2 text-ink-muted', captured: 'bg-brand-soft text-brand' }[s];
  return <Pill className={style}>Deposit {s}</Pill>;
};

export const AgreementPill: React.FC<{ booking: Booking }> = ({ booking }) =>
  booking.agreement ? <Pill className="bg-emerald-50 text-emerald-700">Signed</Pill> : <Pill className="bg-surface-2 text-ink-muted">Unsigned</Pill>;

/** Staff actions available for each status. Mirrors set_booking_status() in the database. */
export const NEXT_ACTIONS: Record<ManagementStatus, Array<{ to: ManagementStatus; label: string; done: string; tone: 'primary' | 'secondary' | 'danger' }>> = {
  pending: [
    { to: 'confirmed', label: 'Confirm', done: 'confirmed', tone: 'primary' },
    { to: 'cancelled', label: 'Decline', done: 'declined', tone: 'danger' }
  ],
  confirmed: [
    { to: 'active', label: 'Start trip', done: 'trip started', tone: 'primary' },
    { to: 'cancelled', label: 'Cancel', done: 'cancelled', tone: 'danger' }
  ],
  active: [
    { to: 'completed', label: 'Complete', done: 'completed', tone: 'primary' },
    { to: 'cancelled', label: 'Cancel', done: 'cancelled', tone: 'danger' }
  ],
  completed: [],
  cancelled: []
};

export const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string; hint?: string }> = ({ label, value, tone, hint }) => (
  <div className="rounded-3xl border border-line bg-white p-4 shadow-card">
    <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{label}</p>
    <p className={cn('mt-1 text-2xl font-extrabold', tone)}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
  </div>
);

export const bookingStart = (b: Booking) => getDateTimeMinutes(b.pickupDate, b.pickupTime) ?? 0;
export const isToday = (date: string) => date === todayISO();

import type { Booking, DepositStatus, ManagementStatus, PaymentStatus } from '../../types/car';

export interface NotificationEvent {
  event: string;
  subject: string;
  channels: Array<'email' | 'sms'>;
}

/**
 * Which automated messages a booking change triggers. Mirrors
 * `enqueue_booking_notifications()` in supabase/migrations/0003_functions.sql.
 */
export function eventsForChange(
  before: { status: ManagementStatus; paymentStatus: PaymentStatus; signed: boolean; deposit?: DepositStatus } | null,
  after: { status: ManagementStatus; paymentStatus: PaymentStatus; signed: boolean; deposit?: DepositStatus },
  b: Pick<Booking, 'id' | 'car'>
): NotificationEvent[] {
  const out: NotificationEvent[] = [];
  const car = b.car.name;
  if (!before) out.push({ event: 'booking.received', subject: `We’ve received your ${car} booking (${b.id})`, channels: ['email'] });
  if (after.paymentStatus === 'paid' && before?.paymentStatus !== 'paid')
    out.push({ event: 'payment.received', subject: `Payment receipt for booking ${b.id}`, channels: ['email'] });
  if (after.paymentStatus === 'failed' && before?.paymentStatus !== 'failed')
    out.push({ event: 'payment.failed', subject: `Payment for booking ${b.id} didn’t go through`, channels: ['email', 'sms'] });
  if (before && before.status !== after.status) {
    const map: Partial<Record<ManagementStatus, NotificationEvent>> = {
      confirmed: { event: 'booking.confirmed', subject: `Confirmed: your ${car} is booked`, channels: ['email', 'sms'] },
      active: { event: 'trip.started', subject: `Enjoy your ${car} — trip started`, channels: ['email'] },
      completed: { event: 'trip.completed', subject: `Thanks for driving with Aurevon — receipt ${b.id}`, channels: ['email'] },
      cancelled: { event: 'booking.cancelled', subject: `Booking ${b.id} cancelled`, channels: ['email', 'sms'] }
    };
    if (map[after.status]) out.push(map[after.status]!);
  }
  // Supabase sends the review request 2 hours after completion (run_cx_jobs); the demo sends it straight away.
  if (before && before.status !== 'completed' && after.status === 'completed')
    out.push({ event: 'review.request', subject: `How was the ${car}? Leave a quick review`, channels: ['email'] });
  if (before && after.deposit !== before.deposit) {
    if (after.deposit === 'held') out.push({ event: 'deposit.held', subject: `Security deposit received for ${b.id}`, channels: ['email'] });
    if (after.deposit === 'released') out.push({ event: 'deposit.released', subject: `Your deposit for ${b.id} has been released`, channels: ['email', 'sms'] });
    if (after.deposit === 'captured') out.push({ event: 'deposit.captured', subject: `Deposit update for ${b.id}`, channels: ['email', 'sms'] });
  }
  if (after.signed && !before?.signed)
    out.push({ event: 'agreement.signed', subject: `Your signed rental agreement for ${b.id}`, channels: ['email'] });
  return out;
}

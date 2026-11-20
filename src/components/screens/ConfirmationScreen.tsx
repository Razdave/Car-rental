import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { CalendarPlus, CheckCircle2, ChevronRight, Clock, CreditCard, FileQuestion, FileSignature, KeyRound, Loader2, MapPin, MessageSquare, QrCode, ShieldCheck, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../state/AppState';
import { backend } from '../../lib/backend';
import { downloadBookingCalendar } from '../../lib/calendar';
import { formatDate } from '../../lib/dates';
import { bookingDurationLabel } from '../../lib/pricing';
import { formatNaira } from '../../utils/currency';
import { BookingSteps, PriceSummary } from '../booking/BookingParts';
import { CancelBookingSheet } from '../booking/BookingSheets';
import { DigitalKeyModal } from '../modals/DigitalKeyModal';
import { ReviewForm } from '../cars/ReviewForm';
import { Button, cn, LinkButton } from '../ui/Button';
import { Card, Container, DetailHeader, EmptyState } from '../ui/Layout';

const PAYMENT_COPY = {
  unpaid: 'Awaiting payment',
  authorized: 'Card authorised — charged at pick-up',
  paid: 'Paid in full',
  refunded: 'Refunded to your original payment method',
  failed: 'Payment failed — please try again or contact us'
} as const;

const STATUS_COPY = {
  pending: { title: 'Booking received', body: 'Our team is confirming availability — usually within an hour.', icon: Clock, tint: 'from-amber-500 to-amber-400' },
  confirmed: { title: 'You’re all set', body: 'Your booking is confirmed. See you at pick-up.', icon: CheckCircle2, tint: 'from-emerald-600 to-emerald-500' },
  active: { title: 'Trip in progress', body: 'Enjoy the drive. Your digital key is ready.', icon: KeyRound, tint: 'from-brand to-[#FF4528]' },
  completed: { title: 'Trip completed', body: 'Thanks for driving with Aurevon.', icon: CheckCircle2, tint: 'from-ink to-[#3a3b40]' },
  cancelled: { title: 'Booking cancelled', body: 'This booking was cancelled.', icon: XCircle, tint: 'from-ink-soft to-ink-faint' }
} as const;

export const ConfirmationScreen: React.FC = () => {
  const { bookingId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { bookings, upsertBooking, refreshBookings, authReady, showToast } = useAppState();
  const [depositBusy, setDepositBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const booking = bookings.find((b) => b.id === bookingId);
  const isNew = params.get('new') === '1';
  const [statusError, setStatusError] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);

  // Make sure we have the latest copy (e.g. returning from Paystack or opening a shared link).
  useEffect(() => {
    if (!authReady) return;
    void refreshBookings().finally(() => setLoading(false));
  }, [authReady, bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Paystack redirects back with ?reference=… — confirm the charge server-side.
  const reference = params.get('reference') ?? params.get('trxref');
  useEffect(() => {
    if (!reference) return;
    setVerifying(true);
    backend
      .verifyPayment(reference)
      .then(() => refreshBookings())
      .catch(() => setStatusError(true))
      .finally(() => setVerifying(false));
  }, [reference]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local mode: poll the Express API for staff status changes. Supabase pushes changes via Realtime.
  const pollable = backend.kind === 'local' && booking && booking.managementStatus && !booking.id.startsWith('DEMO-') && booking.status !== 'cancelled';
  useEffect(() => {
    if (!pollable || !booking) return;
    let active = true;
    const refresh = async () => {
      try {
        const updated = await backend.refreshBooking(booking);
        if (!active) return;
        setStatusError(false);
        if (updated) upsertBooking(updated);
      } catch {
        if (active) setStatusError(true);
      }
    };
    void refresh();
    const id = window.setInterval(refresh, 15000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [pollable, booking?.id, booking?.managementStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!booking) {
    return (
      <>
        <DetailHeader fallback="/bookings" title="Booking" />
        <Container className="py-10">
          {loading || !authReady ? (
            <div className="flex justify-center py-16 text-ink-soft"><Loader2 className="size-8 animate-spin" /></div>
          ) : (
          <EmptyState
            icon={<FileQuestion className="size-7" />}
            title="Booking not found"
            description="It may belong to a different device or account."
            action={<LinkButton to="/bookings" variant="dark">View my trips</LinkButton>}
          />
          )}
        </Container>
      </>
    );
  }

  const status =
    booking.managementStatus ?? (booking.status === 'upcoming' ? 'confirmed' : booking.status);
  const copy = STATUS_COPY[status];
  const StatusIcon = copy.icon;
  const showPass = status === 'confirmed' || status === 'active';
  const extrasTotal = booking.totalAmount + booking.discount - booking.basePrice - booking.taxAmount;
  const lines = [
    { label: `Rental (${bookingDurationLabel(booking)})`, amount: booking.basePrice },
    ...(extrasTotal > 0 ? [{ label: 'Add-ons', amount: extrasTotal }] : []),
    { label: 'Taxes & fees', amount: booking.taxAmount },
    ...(booking.discount > 0 ? [{ label: 'Discount', amount: booking.discount, negative: true }] : [])
  ];

  return (
    <>
      <DetailHeader
        fallback="/bookings"
        onBack={isNew ? () => navigate('/bookings', { replace: true }) : undefined}
        eyebrow={`Booking ${booking.id}`}
        title={booking.car.name}
      />

      <Container className="max-w-3xl pt-5 lg:pt-8">
        {isNew && <BookingSteps current={2} />}

        {/* Status hero */}
        <div className="mt-6 text-center">
          <motion.div
            initial={isNew ? { scale: 0.4, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 14, stiffness: 220 }}
            className={cn('mx-auto flex size-20 items-center justify-center rounded-full bg-gradient-to-tr text-white shadow-lift', copy.tint)}
          >
            <StatusIcon className="size-10" />
          </motion.div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">{copy.title}</h1>
          <p className="mx-auto mt-1 max-w-md text-[15px] text-ink-muted">{copy.body}</p>
          {booking.id.startsWith('DEMO-') && (
            <p className="mx-auto mt-2 max-w-md text-sm text-amber-800">Demo booking — saved on this device only.</p>
          )}
          {statusError && <p className="mt-2 text-sm text-amber-800">Couldn’t refresh the status. We’ll keep trying.</p>}
        </div>

        {/* Pass */}
        <Card className="mt-6 overflow-hidden">
          <div className="flex items-center gap-4 bg-ink p-5 text-white">
            <img src={booking.car.imageUrl} alt="" className="h-16 w-24 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-white/60">{booking.car.brand}</p>
              <p className="truncate text-lg font-bold">{booking.car.name}</p>
              <p className="text-sm text-white/60">{bookingDurationLabel(booking)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 p-5 text-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Pick-up</p>
              <p className="mt-0.5 font-bold">{formatDate(booking.pickupDate)}</p>
              <p className="text-ink-muted">{booking.pickupTime}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Return</p>
              <p className="mt-0.5 font-bold">{formatDate(booking.returnDate)}</p>
              <p className="text-ink-muted">{booking.returnTime}</p>
            </div>
            <div className="col-span-2 flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand" />
              <div>
                <p className="font-bold">{booking.pickupLocation}</p>
                {booking.returnLocation !== booking.pickupLocation && (
                  <p className="text-ink-muted">Return to {booking.returnLocation}</p>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Driver</p>
              <p className="mt-0.5 font-bold">{booking.driverInfo.fullName}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Paid with</p>
              <p className="mt-0.5 font-bold">{booking.paymentMethod}</p>
            </div>
          </div>

          <div className="border-t border-dashed border-line p-5">
            {showPass ? (
              <div className="flex flex-col items-center text-center">
                <div className="rounded-2xl border border-line p-3">
                  <QrCode className="size-24" aria-hidden="true" />
                </div>
                <p className="mt-2 font-mono text-sm font-bold">{booking.digitalPassCode}</p>
                <p className="text-sm text-ink-soft">Show this code at the pick-up desk.</p>
              </div>
            ) : (
              <p className="text-center text-sm text-ink-soft">
                {status === 'pending'
                  ? 'Your pick-up pass appears here once the booking is confirmed.'
                  : 'No pick-up pass for this booking.'}
              </p>
            )}
          </div>
        </Card>

        {status === 'completed' && <ReviewForm booking={booking} />}

        {/* Payment, agreement, messages */}
        <Card className="mt-4 divide-y divide-line overflow-hidden">
          <div className="flex min-h-16 items-center gap-3 p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2"><CreditCard className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">Payment</span>
              <span className="block text-sm text-ink-soft">
                {verifying ? 'Confirming with Paystack…' : PAYMENT_COPY[booking.paymentStatus ?? 'paid']}
              </span>
            </span>
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', booking.paymentStatus === 'unpaid' || booking.paymentStatus === 'failed' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700')}>
              {(booking.paymentStatus ?? 'paid').replace(/^./, (c) => c.toUpperCase())}
            </span>
          </div>
          {(booking.depositAmount ?? 0) > 0 && (
            <div className="flex min-h-16 flex-wrap items-center gap-3 p-4">
              <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', booking.depositStatus === 'pending' ? 'bg-brand-soft text-brand' : 'bg-surface-2')}>
                <ShieldCheck className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Security deposit {formatNaira(booking.depositAmount ?? 0)}</span>
                <span className="block text-sm text-ink-soft">
                  {{
                    none: 'No deposit needed',
                    pending: 'Required before pick-up — refunded after the car is returned and checked',
                    held: 'Held — released after the car is returned and checked',
                    released: 'Released in full — refunds can take 3–5 working days to appear',
                    captured: `${formatNaira(booking.depositCaptured ?? 0)} kept: ${booking.depositNote ?? 'see your messages'}. The rest was refunded.`
                  }[booking.depositStatus ?? 'none']}
                </span>
              </span>
              {booking.depositStatus === 'pending' && status !== 'cancelled' && (
                <Button
                  size="sm"
                  disabled={depositBusy}
                  onClick={async () => {
                    setDepositBusy(true);
                    try {
                      const res = await backend.startDeposit(booking.id, `${window.location.origin}/bookings/${booking.id}`);
                      if (res.redirectUrl) return window.location.assign(res.redirectUrl);
                      if (res.booking) upsertBooking(res.booking);
                      showToast('Deposit received — thank you', 'success');
                    } catch (e) {
                      showToast(e instanceof Error ? e.message : 'Could not take the deposit', 'error');
                    } finally {
                      setDepositBusy(false);
                    }
                  }}
                >
                  {depositBusy && <Loader2 className="size-4 animate-spin" />} Pay deposit
                </Button>
              )}
            </div>
          )}
          {status !== 'cancelled' && (
            <Link to={`/bookings/${booking.id}/agreement`} className="flex min-h-16 items-center gap-3 p-4 hover:bg-surface">
              <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', booking.agreement ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-soft text-brand')}>
                <FileSignature className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Rental agreement</span>
                <span className="block text-sm text-ink-soft">
                  {booking.agreement
                    ? `Signed by ${booking.agreement.signedName} on ${new Date(booking.agreement.signedAt).toLocaleDateString('en-GB')}`
                    : 'Sign before pick-up — it takes a minute'}
                </span>
              </span>
              {!booking.agreement && <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-white">Sign now</span>}
              <ChevronRight className="size-5 shrink-0 text-ink-faint" />
            </Link>
          )}
          <Link to={`/messages?booking=${booking.id}`} className="flex min-h-16 items-center gap-3 p-4 hover:bg-surface">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2"><MessageSquare className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">Message the rental team</span>
              <span className="block text-sm text-ink-soft">Questions about delivery, timing or the car</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-ink-faint" />
          </Link>
        </Card>

        <Card className="mt-4 p-5">
          <PriceSummary lines={lines} total={booking.totalAmount} />
        </Card>

        {/* Actions */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {status === 'active' && (
            <Button size="lg" className="sm:col-span-2" onClick={() => setKeyOpen(true)}>
              <KeyRound className="size-5" /> Open digital key
            </Button>
          )}
          {(status === 'pending' || status === 'confirmed') && (
            <Button variant="dark" size="lg" onClick={() => downloadBookingCalendar(booking)}>
              <CalendarPlus className="size-5" /> Add to calendar
            </Button>
          )}
          <LinkButton to="/bookings" variant="secondary" size="lg" replace={isNew}>
            View all trips
          </LinkButton>
          {(status === 'pending' || status === 'confirmed') && (
            <Button variant="ghost" className="text-brand sm:col-span-2" onClick={() => setCancelOpen(true)}>
              Cancel booking
            </Button>
          )}
          {(status === 'completed' || status === 'cancelled') && (
            <LinkButton to={`/cars/${booking.car.id}`} size="lg">
              Book again
            </LinkButton>
          )}
        </div>
      </Container>

      <CancelBookingSheet booking={cancelOpen ? booking : null} onClose={() => setCancelOpen(false)} />
      <DigitalKeyModal booking={keyOpen ? booking : null} onClose={() => setKeyOpen(false)} />
    </>
  );
};

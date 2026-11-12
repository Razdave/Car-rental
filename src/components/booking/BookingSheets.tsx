import React, { useEffect, useState } from 'react';
import { AlertTriangle, Minus, Plus } from 'lucide-react';
import type { Booking } from '../../types/car';
import { useAppState } from '../../state/AppState';
import { addDays, addHours, formatDate } from '../../lib/dates';
import { calculateQuote, durationLabel } from '../../lib/pricing';
import { formatNaira } from '../../utils/currency';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

export const CancelBookingSheet: React.FC<{ booking: Booking | null; onClose: () => void }> = ({ booking, onClose }) => {
  const { cancelBooking, showToast } = useAppState();
  return (
    <Sheet
      open={booking !== null}
      onClose={onClose}
      size="sm"
      title="Cancel this booking?"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            Keep booking
          </Button>
          <Button
            onClick={() => {
              if (!booking) return;
              cancelBooking(booking.id);
              showToast('Booking cancelled');
              onClose();
            }}
          >
            Yes, cancel
          </Button>
        </div>
      }
    >
      {booking && (
        <div className="flex gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
            <AlertTriangle className="size-5" />
          </span>
          <p className="text-sm leading-relaxed text-ink-muted">
            Your <strong className="text-ink">{booking.car.name}</strong> on {formatDate(booking.pickupDate)} will be
            released. Cancellations more than 24 hours before pick-up are refunded in full ({formatNaira(booking.totalAmount)}).
          </p>
        </div>
      )}
    </Sheet>
  );
};

export const ExtendBookingSheet: React.FC<{ booking: Booking | null; onClose: () => void }> = ({ booking, onClose }) => {
  const { extendBooking, showToast } = useAppState();
  const [amount, setAmount] = useState(1);
  useEffect(() => setAmount(1), [booking?.id]);

  if (!booking) return null;

  const unit = booking.durationUnit ?? 'day';
  const next = unit === 'day' ? { date: addDays(booking.returnDate, amount), time: booking.returnTime } : addHours(booking.returnDate, booking.returnTime, amount);
  const quote = calculateQuote({
    car: booking.car,
    durationUnit: unit,
    pickupDate: booking.pickupDate,
    pickupTime: booking.pickupTime,
    returnDate: next.date,
    returnTime: next.time,
    extras: booking.extraServices
  });
  const extraCost = Math.max(0, quote.totalAmount - booking.discount - booking.totalAmount);
  const max = unit === 'day' ? 14 : 24;

  return (
    <Sheet
      open
      onClose={onClose}
      size="sm"
      title="Extend your trip"
      description={booking.car.name}
      footer={
        <Button
          block
          size="lg"
          onClick={() => {
            extendBooking(booking.id, amount);
            showToast(`Trip extended by ${durationLabel(amount, unit)}`, 'success');
            onClose();
          }}
        >
          Extend for {formatNaira(extraCost)}
        </Button>
      }
    >
      <div className="rounded-2xl bg-surface p-5 text-center">
        <div className="flex items-center justify-center gap-5">
          <button
            type="button"
            aria-label={`Fewer ${unit}s`}
            disabled={amount <= 1}
            onClick={() => setAmount((a) => Math.max(1, a - 1))}
            className="flex size-12 items-center justify-center rounded-full bg-white shadow-sm disabled:opacity-40"
          >
            <Minus className="size-5" />
          </button>
          <p className="min-w-28 text-2xl font-extrabold" aria-live="polite">
            +{durationLabel(amount, unit)}
          </p>
          <button
            type="button"
            aria-label={`More ${unit}s`}
            disabled={amount >= max}
            onClick={() => setAmount((a) => Math.min(max, a + 1))}
            className="flex size-12 items-center justify-center rounded-full bg-white shadow-sm disabled:opacity-40"
          >
            <Plus className="size-5" />
          </button>
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          New return: <strong className="text-ink">{formatDate(next.date)}, {next.time}</strong>
        </p>
      </div>
      <p className="mt-3 text-center text-xs text-ink-soft">Extensions are subject to availability and confirmed by our team.</p>
    </Sheet>
  );
};

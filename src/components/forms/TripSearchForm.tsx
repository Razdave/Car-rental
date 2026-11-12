import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, MapPin, Search } from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { addDays, todayISO } from '../../lib/dates';
import { Button, cn } from '../ui/Button';

interface TripSearchFormProps {
  /** `hero`: stacked on phones, one row from lg. `bar`: always compact (Explore toolbar). */
  variant?: 'hero' | 'bar';
  /** Navigate to Explore after applying (Home). Explore applies in place. */
  navigateOnSubmit?: boolean;
}

const fieldShell = 'flex min-h-14 items-center gap-3 rounded-2xl bg-surface px-4 text-left transition-colors focus-within:ring-2 focus-within:ring-brand/30';

export const TripSearchForm: React.FC<TripSearchFormProps> = ({ variant = 'hero', navigateOnSubmit = false }) => {
  const { trip, setTrip, pickupLocation, openLocationPicker } = useAppState();
  const navigate = useNavigate();
  const [pickupDate, setPickupDate] = useState(trip.pickupDate);
  const [returnDate, setReturnDate] = useState(trip.returnDate);

  useEffect(() => {
    setPickupDate(trip.pickupDate);
    setReturnDate(trip.returnDate);
  }, [trip]);

  const today = todayISO();

  const changePickup = (value: string) => {
    setPickupDate(value);
    // Keep the range valid instead of showing an error.
    if (value && returnDate <= value) setReturnDate(addDays(value, 1));
    if (!navigateOnSubmit && value) setTrip({ pickupDate: value, returnDate: returnDate <= value ? addDays(value, 1) : returnDate });
  };

  const changeReturn = (value: string) => {
    setReturnDate(value);
    if (!navigateOnSubmit && value) setTrip({ pickupDate, returnDate: value });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTrip({ pickupDate, returnDate });
    if (navigateOnSubmit) navigate('/explore');
  };

  const bar = variant === 'bar';

  return (
    <form
      onSubmit={submit}
      className={cn(
        'grid gap-2 rounded-3xl bg-white p-2 shadow-lift',
        bar ? 'grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]' : 'grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto]'
      )}
      aria-label="Search rentals"
    >
      <button
        type="button"
        onClick={() => openLocationPicker('both')}
        className={cn(fieldShell, 'col-span-2 hover:bg-surface-2 lg:col-span-1')}
      >
        <MapPin className="size-5 shrink-0 text-brand" />
        <span className="min-w-0">
          <span className="block text-xs font-bold uppercase tracking-wider text-ink-soft">Pick-up & return</span>
          <span className="block truncate text-sm font-bold sm:text-base">{pickupLocation}</span>
        </span>
      </button>

      <label className={fieldShell}>
        <CalendarDays className="hidden size-5 shrink-0 text-ink-soft sm:block" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold uppercase tracking-wider text-ink-soft">From</span>
          <input
            type="date"
            required
            min={today}
            value={pickupDate}
            onChange={(e) => changePickup(e.target.value)}
            className="w-full bg-transparent text-base font-bold outline-none sm:text-sm"
          />
        </span>
      </label>

      <label className={fieldShell}>
        <CalendarDays className="hidden size-5 shrink-0 text-ink-soft sm:block" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold uppercase tracking-wider text-ink-soft">Until</span>
          <input
            type="date"
            required
            min={pickupDate || today}
            value={returnDate}
            onChange={(e) => changeReturn(e.target.value)}
            className="w-full bg-transparent text-base font-bold outline-none sm:text-sm"
          />
        </span>
      </label>

      {!bar && (
        <Button type="submit" size="lg" className="col-span-2 lg:col-span-1 lg:min-h-full">
          <Search className="size-5" />
          Search cars
        </Button>
      )}
    </form>
  );
};

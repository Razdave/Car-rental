import React from 'react';
import { Check } from 'lucide-react';
import type { Car } from '../../types/car';
import { formatNaira } from '../../utils/currency';
import { cn } from '../ui/Button';

const STEPS = ['Trip details', 'Payment', 'Done'];

export const BookingSteps: React.FC<{ current: 0 | 1 | 2 }> = ({ current }) => (
  <ol className="flex items-center gap-2" aria-label="Booking progress">
    {STEPS.map((label, i) => (
      <li key={label} className="flex flex-1 items-center gap-2" aria-current={i === current ? 'step' : undefined}>
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold',
            i < current && 'bg-ink text-white',
            i === current && 'bg-brand text-white',
            i > current && 'bg-surface-2 text-ink-soft'
          )}
        >
          {i < current ? <Check className="size-4" /> : i + 1}
        </span>
        <span className={cn('truncate text-sm font-bold', i === current ? 'text-ink' : 'text-ink-soft', i !== current && 'hidden sm:inline')}>
          {label}
        </span>
        {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line" />}
      </li>
    ))}
  </ol>
);

export const CarSummary: React.FC<{ car: Car; detail: React.ReactNode }> = ({ car, detail }) => (
  <div className="flex items-center gap-3">
    <img src={car.imageUrl} alt="" className="h-16 w-24 shrink-0 rounded-2xl object-cover" />
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{car.brand}</p>
      <p className="truncate font-bold">{car.name}</p>
      <p className="truncate text-sm text-ink-soft">{detail}</p>
    </div>
  </div>
);

export interface PriceLine {
  label: string;
  amount: number;
  negative?: boolean;
}

export const PriceSummary: React.FC<{ lines: PriceLine[]; total: number; note?: React.ReactNode }> = ({ lines, total, note }) => (
  <div className="text-sm">
    <dl className="space-y-2.5">
      {lines.map((line) => (
        <div key={line.label} className="flex justify-between gap-4">
          <dt className="text-ink-muted">{line.label}</dt>
          <dd className={cn('shrink-0 font-bold', line.negative && 'text-emerald-700')}>
            {line.negative ? '−' : ''}
            {formatNaira(line.amount)}
          </dd>
        </div>
      ))}
    </dl>
    <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-line pt-4">
      <span className="text-base font-extrabold">Total</span>
      <span className="text-xl font-extrabold text-brand">{formatNaira(total)}</span>
    </div>
    {note && <p className="mt-2 text-xs text-emerald-700">{note}</p>}
  </div>
);

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
  className?: string;
}

/** Label + control + inline error, wired up for screen readers. */
export const Field: React.FC<FieldProps> = ({ label, error, hint, children, className }) => {
  const id = React.useId();
  const msgId = `${id}-msg`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-ink-muted">
        {label}
      </label>
      {React.cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? msgId : undefined
      })}
      {(error || hint) && (
        <p id={msgId} className={cn('mt-1.5 text-sm', error ? 'font-semibold text-brand' : 'text-ink-soft')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
};

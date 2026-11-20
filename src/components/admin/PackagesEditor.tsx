import React from 'react';
import { AlertTriangle, PackagePlus, Trash2 } from 'lucide-react';
import type { RatePackage } from '../../types/car';
import { WEEKDAYS } from '../../lib/pricing';
import { formatNaira } from '../../utils/currency';
import { Button, cn } from '../ui/Button';

interface Props {
  packages: RatePackage[];
  onChange: (packages: RatePackage[]) => void;
  standardDaily: number;
  standardHourly: number;
}

const newId = () => `pkg-${Math.random().toString(36).slice(2, 12)}`;

const TEMPLATES: Array<{ label: string; make: (daily: number, hourly: number) => RatePackage }> = [
  {
    label: 'Weekend special',
    make: (daily) => ({
      id: newId(), name: 'Weekend Escape', description: 'Friday to Monday at one fixed price.', durationUnit: 'day', duration: 3,
      price: Math.round((daily * 2.75) / 10000) * 10000, includes: ['Friday pick-up, Monday return', '750 km included'], pickupDays: [5], active: true
    })
  },
  {
    label: 'Red-carpet / wedding block',
    make: (_d, hourly) => ({
      id: newId(), name: 'Red Carpet & Wedding', description: 'A chauffeured block for weddings and big arrivals.', durationUnit: 'hour', duration: 6,
      price: Math.round((hourly * 6 * 1.15) / 10000) * 10000, includes: ['Professional chauffeur', 'Ribbon and floral detailing on request', 'Fully detailed car'],
      pickupDays: [], active: true
    })
  },
  {
    label: 'Weekly rate',
    make: (daily) => ({
      id: newId(), name: 'Seven-Day Rate', description: 'A full week at a fixed weekly rate.', durationUnit: 'day', duration: 7,
      price: Math.round((daily * 6.25) / 10000) * 10000, includes: ['7 days, any start day', '1,500 km included'], pickupDays: [], active: true
    })
  }
];

/** Fixed-price packages for one listing. Shows the standard-rate equivalent so packages are priced on value, not as deep discounts. */
export const PackagesEditor: React.FC<Props> = ({ packages, onChange, standardDaily, standardHourly }) => {
  const update = (id: string, patch: Partial<RatePackage>) => onChange(packages.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink-muted">Rate packages</p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <Button key={t.label} size="sm" variant="secondary" onClick={() => onChange([...packages, t.make(standardDaily || 0, standardHourly || 0)])}>
              <PackagePlus className="size-4" /> {t.label}
            </Button>
          ))}
        </div>
      </div>
      <p className="mb-3 text-sm text-ink-soft">
        One fixed price for a set duration. Customers see what’s included, not a percentage off, and promo codes don’t apply.
      </p>

      {packages.length === 0 && <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-ink-soft">No packages — this car is offered at its standard daily and hourly rates.</p>}

      <div className="space-y-3">
        {packages.map((p) => {
          const standard = (p.durationUnit === 'day' ? standardDaily : standardHourly) * p.duration;
          const ratio = standard > 0 ? p.price / standard : 1;
          return (
            <div key={p.id} className={cn('rounded-2xl border p-4', p.active ? 'border-line' : 'border-dashed border-line opacity-70')}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="col-span-2">
                  <span className="mb-1 block text-xs font-bold uppercase text-ink-soft">Name</span>
                  <input className="field" value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-bold uppercase text-ink-soft">Length</span>
                  <input className="field" type="number" min={1} max={60} value={p.duration} onChange={(e) => update(p.id, { duration: Math.max(1, Number(e.target.value)) })} />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-bold uppercase text-ink-soft">Unit</span>
                  <select className="field" value={p.durationUnit} onChange={(e) => update(p.id, { durationUnit: e.target.value as RatePackage['durationUnit'] })}>
                    <option value="day">Days</option>
                    <option value="hour">Hours</option>
                  </select>
                </label>
                <label className="col-span-2">
                  <span className="mb-1 block text-xs font-bold uppercase text-ink-soft">Fixed price (₦)</span>
                  <input className="field" type="number" min={0} step={10000} inputMode="numeric" value={p.price || ''} onChange={(e) => update(p.id, { price: Number(e.target.value) })} />
                </label>
                <div className="col-span-2 flex items-end">
                  <p className="text-sm text-ink-soft">
                    Standard rate for {p.duration} {p.durationUnit === 'day' ? 'days' : 'hours'}: <strong className="text-ink">{formatNaira(standard)}</strong>
                  </p>
                </div>
              </div>

              {ratio < 0.7 && (
                <p className="mt-2 flex items-start gap-1.5 text-sm font-semibold text-amber-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  That’s {Math.round((1 - ratio) * 100)}% below the standard rate. Packages work best priced on what’s included, not as deep discounts.
                </p>
              )}

              <fieldset className="mt-3">
                <legend className="mb-1 text-xs font-bold uppercase text-ink-soft">Pick-up days (none selected = any day)</legend>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d, i) => {
                    const on = p.pickupDays.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update(p.id, { pickupDays: on ? p.pickupDays.filter((x) => x !== i) : [...p.pickupDays, i].sort() })}
                        className={cn('min-h-11 min-w-11 rounded-xl px-2 text-sm font-bold', on ? 'bg-ink text-white' : 'bg-surface-2 text-ink-muted')}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-bold uppercase text-ink-soft">Description</span>
                <input className="field" value={p.description} onChange={(e) => update(p.id, { description: e.target.value })} />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-bold uppercase text-ink-soft">What’s included (one per line)</span>
                <textarea
                  className="field min-h-20"
                  value={p.includes.join('\n')}
                  onChange={(e) => update(p.id, { includes: e.target.value.split('\n') })}
                  onBlur={(e) => update(p.id, { includes: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                />
              </label>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold">
                  <input type="checkbox" className="size-5 accent-brand" checked={p.active} onChange={(e) => update(p.id, { active: e.target.checked })} />
                  Offered to customers
                </label>
                <Button size="sm" variant="ghost" className="text-brand" onClick={() => onChange(packages.filter((x) => x.id !== p.id))}>
                  <Trash2 className="size-4" /> Remove
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

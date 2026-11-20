import React, { useState } from 'react';
import { Trash2, Wrench } from 'lucide-react';
import type { Booking, Car, CarBlock } from '../../types/car';
import { backend, isOpenStatus, managementStatusOf } from '../../lib/backend';
import { addDays, getDateTimeMinutes, todayISO } from '../../lib/dates';
import { Field } from '../booking/BookingParts';
import { Button, cn } from '../ui/Button';
import { Card, SectionLabel } from '../ui/Layout';

interface Props {
  cars: Car[];
  bookings: Booking[];
  blocks: CarBlock[];
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
}

const DAYS = 14;
const dayStart = (iso: string) => getDateTimeMinutes(iso, '12:00 AM')!;
const wallMinutes = (wall: string) => {
  const [d, t] = wall.split('T');
  const [h, m] = t.split(':').map(Number);
  return dayStart(d) + h * 60 + m;
};

type Cell = { kind: 'free' } | { kind: 'booking'; booking: Booking } | { kind: 'block'; block: CarBlock } | { kind: 'off' };

export const FleetPanel: React.FC<Props> = ({ cars, bookings, blocks, run }) => {
  const today = todayISO();
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const [form, setForm] = useState({ carId: cars[0]?.id ?? '', start: `${today}T08:00`, end: `${today}T17:00`, reason: 'Service' });

  const cellFor = (car: Car, day: string): Cell => {
    if (!car.isAvailable) return { kind: 'off' };
    const s = dayStart(day);
    const e = s + 1440;
    const booking = bookings.find((b) => {
      if (b.carId !== car.id || !isOpenStatus(managementStatusOf(b))) return false;
      const bs = getDateTimeMinutes(b.pickupDate, b.pickupTime) ?? 0;
      const be = getDateTimeMinutes(b.returnDate, b.returnTime) ?? 0;
      return bs < e && be > s;
    });
    if (booking) return { kind: 'booking', booking };
    const block = blocks.find((bl) => bl.carId === car.id && wallMinutes(bl.startsAt) < e && wallMinutes(bl.endsAt) > s);
    return block ? { kind: 'block', block } : { kind: 'free' };
  };

  const upcomingBlocks = blocks.filter((b) => b.endsAt >= `${today}T00:00`).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SectionLabel className="mb-0">Availability — next 14 days</SectionLabel>
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-ink-muted">
            <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-emerald-100 ring-1 ring-emerald-300" />Free</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-amber-300" />Pending</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-sky-500" />Booked</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-ink" />On trip</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-[repeating-linear-gradient(45deg,#d4d4d8_0_3px,#f4f4f5_3px_6px)]" />Blocked</span>
          </div>
        </div>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed border-separate border-spacing-0 text-sm">
            <colgroup>
              <col className="w-48" />
              {days.map((d) => <col key={d} />)}
              <col className="w-28" />
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white p-3 text-left font-bold">Car</th>
                {days.map((d) => {
                  const date = new Date(`${d}T00:00`);
                  return (
                    <th key={d} className={cn('p-1.5 text-center text-xs font-bold', d === today ? 'text-brand' : 'text-ink-soft')}>
                      <span className="block">{date.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                      <span className="block text-sm text-ink">{date.getDate()}</span>
                    </th>
                  );
                })}
                <th className="p-3 text-right font-bold">In service</th>
              </tr>
            </thead>
            <tbody>
              {cars.map((car) => (
                <tr key={car.id}>
                  <td className="sticky left-0 z-10 border-t border-line bg-white p-3">
                    <span className="block max-w-[11rem] truncate font-bold">{car.name}</span>
                  </td>
                  {days.map((d) => {
                    const cell = cellFor(car, d);
                    const title =
                      cell.kind === 'booking'
                        ? `${cell.booking.id} · ${cell.booking.driverInfo.fullName} (${managementStatusOf(cell.booking)})`
                        : cell.kind === 'block'
                          ? `Blocked: ${cell.block.reason}`
                          : cell.kind === 'off'
                            ? 'Out of service'
                            : 'Free';
                    return (
                      <td key={d} className="border-t border-line p-1">
                        <div
                          title={title}
                          aria-label={`${car.name}, ${d}: ${title}`}
                          className={cn(
                            'h-9 rounded-md',
                            cell.kind === 'free' && 'bg-emerald-50 ring-1 ring-inset ring-emerald-200',
                            cell.kind === 'off' && 'bg-surface-2',
                            cell.kind === 'block' && 'bg-[repeating-linear-gradient(45deg,#d4d4d8_0_4px,#f4f4f5_4px_8px)]',
                            cell.kind === 'booking' && {
                              pending: 'bg-amber-300',
                              confirmed: 'bg-sky-500',
                              active: 'bg-ink',
                              completed: '',
                              cancelled: ''
                            }[managementStatusOf(cell.booking)]
                          )}
                        />
                      </td>
                    );
                  })}
                  <td className="border-t border-line p-3 text-right">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={car.isAvailable}
                      aria-label={`${car.name} in service`}
                      onClick={() =>
                        void run(
                          () => backend.admin.setCarAvailability(car.id, !car.isAvailable),
                          car.isAvailable ? `${car.name} taken out of service` : `${car.name} back in service`
                        )
                      }
                      className={cn('relative inline-block h-7 w-12 rounded-full transition-colors', car.isAvailable ? 'bg-emerald-500' : 'bg-line')}
                    >
                      <span className={cn('absolute top-1 size-5 rounded-full bg-white shadow transition-[left]', car.isAvailable ? 'left-6' : 'left-1')} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="p-5">
          <p className="mb-4 flex items-center gap-2 font-extrabold">
            <Wrench className="size-5 text-brand" /> Block a car
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => backend.admin.addBlock({ carId: form.carId, startsAt: form.start, endsAt: form.end, reason: form.reason.trim() || 'Unavailable' }), 'Block added — the car is hidden for that time');
            }}
          >
            <Field label="Car">
              <select className="field" value={form.carId} onChange={(e) => setForm({ ...form, carId: e.target.value })}>
                {cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Field label="From">
                <input className="field" type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
              </Field>
              <Field label="Until">
                <input className="field" type="datetime-local" min={form.start} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
              </Field>
            </div>
            <Field label="Reason">
              <input className="field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Service, cleaning, repair…" />
            </Field>
            <Button type="submit" block variant="dark">Add block</Button>
          </form>
        </Card>

        <Card className="p-5">
          <p className="mb-3 font-extrabold">Upcoming blocks</p>
          {upcomingBlocks.length === 0 ? (
            <p className="text-sm text-ink-soft">No maintenance or other blocks scheduled.</p>
          ) : (
            <ul className="divide-y divide-line">
              {upcomingBlocks.map((bl) => (
                <li key={bl.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{cars.find((c) => c.id === bl.carId)?.name ?? bl.carId} · {bl.reason}</span>
                    <span className="block text-ink-soft">{bl.startsAt.replace('T', ' ')} → {bl.endsAt.replace('T', ' ')}</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Remove block"
                    onClick={() => void run(() => backend.admin.removeBlock(bl.id), 'Block removed')}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-brand-soft hover:text-brand"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
};

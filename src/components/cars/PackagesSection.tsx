import React from 'react';
import { Check, PackageCheck } from 'lucide-react';
import type { Car } from '../../types/car';
import { packageDurationLabel, packagePickupLabel } from '../../lib/pricing';
import { formatNaira } from '../../utils/currency';
import { LinkButton } from '../ui/Button';

/** Fixed-price packages on the car page, each with a direct "Book" link. */
export const PackagesSection: React.FC<{ car: Car }> = ({ car }) => {
  const packages = (car.packages ?? []).filter((p) => p.active);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {packages.map((p) => (
        <article key={p.id} className="flex flex-col rounded-2xl border border-line p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <PackageCheck className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-extrabold">{p.name}</h3>
              <p className="text-sm text-ink-soft">{packageDurationLabel(p)} · {packagePickupLabel(p)}</p>
            </div>
          </div>
          {p.description && <p className="mt-2 text-sm text-ink-muted">{p.description}</p>}
          {p.includes.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {p.includes.map((i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                  {i}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto flex items-center justify-between gap-3 pt-4">
            <p className="text-lg font-extrabold">{formatNaira(p.price)}</p>
            <LinkButton to={`/cars/${car.id}/book?package=${encodeURIComponent(p.id)}`} size="sm" variant="dark">
              Book package
            </LinkButton>
          </div>
        </article>
      ))}
    </div>
  );
};

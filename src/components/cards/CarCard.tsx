import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Fuel, Gauge, Heart, Star, Users } from 'lucide-react';
import type { Car } from '../../types/car';
import { useAppState } from '../../state/AppState';
import { formatNaira } from '../../utils/currency';
import { cn } from '../ui/Button';

interface CarCardProps {
  car: Car;
  layout?: 'standard' | 'horizontal';
}

const FavoriteButton: React.FC<{ car: Car; className?: string }> = ({ car, className }) => {
  const { favorites, toggleFavorite } = useAppState();
  const saved = favorites.includes(car.id);
  return (
    <button
      type="button"
      onClick={() => toggleFavorite(car.id)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${car.name} from saved` : `Save ${car.name}`}
      className={cn(
        'z-10 flex size-11 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-colors hover:bg-brand-soft active:scale-90',
        className
      )}
    >
      <Heart className={cn('size-[18px] transition-colors', saved ? 'fill-brand text-brand' : 'text-ink-soft')} />
    </button>
  );
};

export const CarCard: React.FC<CarCardProps> = ({ car, layout = 'standard' }) => {
  if (layout === 'horizontal') {
    return (
      <article className="relative">
        <Link
          to={`/cars/${car.id}`}
          className="flex items-center gap-4 rounded-3xl border border-line/80 bg-white p-3 pr-14 shadow-card transition-shadow hover:shadow-lift sm:p-4 sm:pr-16"
        >
          <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface sm:h-24 sm:w-36">
            <img src={car.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{car.brand}</p>
            <h3 className="truncate text-base font-bold">{car.name}</h3>
            <p className="mt-0.5 truncate text-sm text-ink-muted">
              {car.transmission} · {car.seats} seats · {car.powerHp} hp
            </p>
            <p className="mt-1.5 text-sm">
              <span className="font-extrabold">{formatNaira(car.pricePerDay)}</span>
              <span className="text-ink-soft"> /day</span>
            </p>
          </div>
        </Link>
        <FavoriteButton car={car} className="absolute right-2 top-2 sm:right-3 sm:top-3" />
      </article>
    );
  }

  return (
    <article className="group relative">
      <Link
        to={`/cars/${car.id}`}
        className="flex h-full flex-col overflow-hidden rounded-[28px] border border-line/80 bg-white shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lift"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-surface">
          <img
            src={car.imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold backdrop-blur">
            {car.category}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{car.brand}</p>
              <h3 className="truncate text-lg font-bold leading-snug">{car.name}</h3>
            </div>
            <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-sm font-bold">
              <Star className="size-4 fill-amber-400 text-amber-400" />
              {car.rating.toFixed(1)}
            </span>
          </div>

          <ul className="mb-4 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            <li className="inline-flex items-center gap-1.5">
              <Gauge className="size-4 text-ink-soft" /> {car.powerHp} hp
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Users className="size-4 text-ink-soft" /> {car.seats} seats
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Fuel className="size-4 text-ink-soft" /> {car.fuelType}
            </li>
          </ul>

          <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4">
            <div>
              <p className="text-lg font-extrabold leading-none">
                {formatNaira(car.pricePerDay)}
                <span className="text-sm font-medium text-ink-soft"> /day</span>
              </p>
              <p className="mt-1 text-xs text-ink-soft">or {formatNaira(car.pricePerHour)} /hour</p>
            </div>
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-bold text-white transition-colors group-hover:bg-brand">
              Rent
              <ArrowRight className="size-4" />
            </span>
          </div>
        </div>
      </Link>
      <FavoriteButton car={car} className="absolute right-3 top-3" />
    </article>
  );
};

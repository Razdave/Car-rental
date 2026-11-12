import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarClock, ChevronRight, Copy, Sparkles } from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { CATEGORIES } from '../../lib/filters';
import { formatDate } from '../../lib/dates';
import { CarCard } from '../cards/CarCard';
import { TripSearchForm } from '../forms/TripSearchForm';
import { Button } from '../ui/Button';
import { Container } from '../ui/Layout';
import { FleetNotice } from '../ui/FleetNotice';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const SectionHeader: React.FC<{ title: string; subtitle: string; to?: string }> = ({ title, subtitle, to }) => (
  <div className="mb-4 flex items-end justify-between gap-4">
    <div>
      <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2>
      <p className="text-sm text-ink-soft">{subtitle}</p>
    </div>
    {to && (
      <Link to={to} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-bold text-brand hover:underline">
        See all <ArrowRight className="size-4" />
      </Link>
    )}
  </div>
);

export const HomeScreen: React.FC = () => {
  const { cars, bookings, profile, setFilters, showToast } = useAppState();
  const navigate = useNavigate();

  const popular = cars.filter((c) => c.isPopular).slice(0, 6);
  const more = cars.filter((c) => !c.isPopular).concat(cars.filter((c) => c.isPopular)).slice(0, 4);
  const nextTrip =
    bookings.find((b) => b.status === 'active') ??
    bookings
      .filter((b) => b.status === 'upcoming')
      .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate))[0];

  const browseCategory = (category: (typeof CATEGORIES)[number]) => {
    setFilters((f) => ({ ...f, category }));
    navigate('/explore');
  };

  const copyPromo = async () => {
    try {
      await navigator.clipboard.writeText('DRIVE20');
      showToast('Code DRIVE20 copied', 'success');
    } catch {
      showToast('Use code DRIVE20 at checkout');
    }
  };

  return (
    <Container>
      {/* Hero + search */}
      <section className="pt-5 sm:pt-8">
        <p className="text-sm font-semibold text-ink-soft">
          {greeting()}, {profile.fullName.split(' ')[0]}
        </p>
        <h1 className="mt-1 text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-4xl">
          Find your next <span className="text-brand">drive</span>
        </h1>
        <FleetNotice />

        <div className="relative mt-5 overflow-hidden rounded-[32px] bg-ink">
          <img
            src="/images/car_hero_banner_1794399931970.jpg"
            alt=""
            className="absolute inset-0 size-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/10 lg:bg-gradient-to-r" />
          <div className="relative p-4 pt-28 sm:p-6 sm:pt-40 lg:p-10 lg:pt-28">
            <p className="mb-4 max-w-md text-lg font-bold leading-snug text-white sm:text-2xl">
              Premium cars, by the day or by the hour.
            </p>
            <TripSearchForm navigateOnSubmit />
          </div>
        </div>
      </section>

      {/* Next trip */}
      {nextTrip && (
        <Link
          to={nextTrip.status === 'active' ? '/bookings?tab=active' : `/bookings/${nextTrip.id}`}
          className="mt-5 flex items-center gap-4 rounded-3xl border border-line bg-white p-3 pr-4 shadow-card transition-shadow hover:shadow-lift"
        >
          <img src={nextTrip.car.imageUrl} alt="" className="h-16 w-20 shrink-0 rounded-2xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand">
              <CalendarClock className="size-3.5" />
              {nextTrip.status === 'active' ? 'Trip in progress' : 'Your next trip'}
            </p>
            <p className="truncate font-bold">{nextTrip.car.name}</p>
            <p className="truncate text-sm text-ink-soft">
              {nextTrip.status === 'active'
                ? `Return ${formatDate(nextTrip.returnDate)}, ${nextTrip.returnTime}`
                : `${formatDate(nextTrip.pickupDate)} · ${nextTrip.pickupTime}`}
            </p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-ink-faint" />
        </Link>
      )}

      {/* Categories */}
      <section className="mt-8" aria-label="Browse by category">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => browseCategory(cat)}
              className="min-h-11 shrink-0 rounded-2xl border border-line bg-white px-5 text-sm font-bold text-ink-muted shadow-sm transition-colors hover:border-ink hover:text-ink"
            >
              {cat === 'All' ? 'All cars' : cat}
            </button>
          ))}
        </div>
      </section>

      {/* Popular */}
      <section className="mt-8">
        <SectionHeader title="Popular right now" subtitle="Most-booked cars this month" to="/explore" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {popular.map((car) => (
            <CarCard key={car.id} car={car} />
          ))}
        </div>
      </section>

      {/* Promo */}
      <section className="mt-10 flex flex-col gap-4 overflow-hidden rounded-[28px] bg-ink p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider">
            <Sparkles className="size-3.5" /> Weekend offer
          </span>
          <p className="mt-3 text-2xl font-extrabold">20% off any rental</p>
          <p className="mt-1 text-sm text-white/70">Apply the code at checkout. Valid on daily and hourly bookings.</p>
        </div>
        <Button variant="light" size="lg" onClick={copyPromo} className="shrink-0 font-mono tracking-widest">
          <Copy className="size-4" /> DRIVE20
        </Button>
      </section>

      {/* More */}
      <section className="mt-10">
        <SectionHeader title="More to explore" subtitle="Electric, sport and luxury picks" to="/explore" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
          {more.map((car) => (
            <CarCard key={`more-${car.id}`} car={car} layout="horizontal" />
          ))}
        </div>
      </section>
    </Container>
  );
};

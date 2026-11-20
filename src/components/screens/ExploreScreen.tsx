import React, { useState } from 'react';
import { Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
import type { FilterOptions } from '../../types/car';
import { useAppState } from '../../state/AppState';
import { activeFilterCount, CATEGORIES, filterCars, SORT_OPTIONS } from '../../lib/filters';
import { formatDateRange } from '../../lib/dates';
import { CarCard } from '../cards/CarCard';
import { TripSearchForm } from '../forms/TripSearchForm';
import { FilterPanel } from '../modals/FilterModal';
import { Button, cn } from '../ui/Button';
import { Container, EmptyState, PageTitle } from '../ui/Layout';
import { FleetNotice } from '../ui/FleetNotice';

export const ExploreScreen: React.FC = () => {
  const { cars, filters, setFilters, resetFilters, setFilterSheetOpen, trip, unavailableIds } = useAppState();
  const [showBooked, setShowBooked] = useState(false);
  const matches = filterCars(cars, filters);
  const bookedCount = matches.filter((c) => unavailableIds.includes(c.id)).length;
  const results = showBooked ? matches : matches.filter((c) => !unavailableIds.includes(c.id));
  const refinements = activeFilterCount(filters);

  return (
    <Container>
      <PageTitle
        title="Explore the fleet"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
              {matches.length - bookedCount} available
            </span>
            <span>· {formatDateRange(trip.pickupDate, trip.returnDate)}</span>
          </span>
        }
      />
      <FleetNotice />

      <div className="mt-2">
        <TripSearchForm variant="bar" />
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            inputMode="search"
            placeholder="Search make or model"
            aria-label="Search make or model"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="field pl-12 pr-12"
          />
          {filters.search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setFilters({ ...filters, search: '' })}
              className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <Button
          variant="dark"
          onClick={() => setFilterSheetOpen(true)}
          className="relative lg:hidden"
          aria-label={refinements ? `Filters, ${refinements} active` : 'Filters'}
        >
          <SlidersHorizontal className="size-5" />
          <span className="hidden sm:inline">Filters</span>
          {refinements > 0 && (
            <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-brand text-[11px] font-extrabold ring-2 ring-surface">
              {refinements}
            </span>
          )}
        </Button>

        <label className="hidden sm:block">
          <span className="sr-only">Sort by</span>
          <select
            value={filters.sortBy}
            onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as FilterOptions['sortBy'] })}
            className="field w-auto pr-8"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Category chips (phones/tablets — the sidebar covers desktop) */}
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:px-0 lg:hidden">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={filters.category === cat}
            onClick={() => setFilters({ ...filters, category: cat })}
            className={cn(
              'min-h-11 shrink-0 rounded-2xl px-4 text-sm font-bold transition-colors',
              filters.category === cat ? 'bg-ink text-white' : 'border border-line bg-white text-ink-muted hover:text-ink'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="mt-6 lg:grid lg:grid-cols-[260px_1fr] lg:gap-8">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-24 rounded-3xl border border-line bg-white p-5 shadow-card">
            <div className="mb-5 flex items-center justify-between">
              <p className="font-extrabold">Filters</p>
              {refinements > 0 && (
                <button type="button" onClick={resetFilters} className="min-h-11 text-sm font-bold text-brand hover:underline">
                  Clear all
                </button>
              )}
            </div>
            <FilterPanel filters={filters} onChange={setFilters} showSort={false} />
          </div>
        </aside>

        <section aria-live="polite">
          {bookedCount > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 px-4 py-2 text-sm text-ink-muted">
              <span>
                {bookedCount} {bookedCount === 1 ? 'car is' : 'cars are'} already booked for these dates.
              </span>
              <button type="button" onClick={() => setShowBooked((v) => !v)} className="min-h-11 font-bold text-brand hover:underline">
                {showBooked ? 'Hide booked cars' : 'Show them'}
              </button>
            </div>
          )}
          {results.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-7" />}
              title="No cars match"
              description="Try a different search, or widen your price and seat filters."
              action={
                <Button variant="dark" onClick={resetFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6">
              {results.map((car) => (
                <CarCard key={car.id} car={car} unavailable={unavailableIds.includes(car.id)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </Container>
  );
};

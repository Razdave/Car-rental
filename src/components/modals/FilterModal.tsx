import React from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { FilterOptions } from '../../types/car';
import { useAppState } from '../../state/AppState';
import { CATEGORIES, filterCars, PRICE_MAX, PRICE_MIN, SORT_OPTIONS } from '../../lib/filters';
import { formatNaira } from '../../utils/currency';
import { Button, cn } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

const chip = (selected: boolean) =>
  cn(
    'min-h-11 rounded-xl px-4 text-sm font-semibold transition-colors',
    selected ? 'bg-ink text-white' : 'bg-surface-2 text-ink-muted hover:bg-line'
  );

interface FilterPanelProps {
  filters: FilterOptions;
  onChange: (filters: FilterOptions) => void;
  /** Sort is shown inline on the Explore toolbar, so the sidebar can hide it. */
  showSort?: boolean;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({ filters, onChange, showSort = true }) => (
  <div className="space-y-7">
    <fieldset>
      <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">Category</legend>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={filters.category === cat}
            onClick={() => onChange({ ...filters, category: cat })}
            className={chip(filters.category === cat)}
          >
            {cat}
          </button>
        ))}
      </div>
    </fieldset>

    <fieldset>
      <div className="mb-2 flex items-center justify-between">
        <legend className="text-xs font-bold uppercase tracking-wider text-ink-muted">Max daily rate</legend>
        <span className="text-sm font-bold text-brand">{formatNaira(filters.maxPrice)}</span>
      </div>
      <input
        type="range"
        min={PRICE_MIN}
        max={PRICE_MAX}
        step={10000}
        value={filters.maxPrice}
        aria-label="Maximum daily rate"
        onChange={(e) => onChange({ ...filters, maxPrice: Number(e.target.value) })}
        className="h-11 w-full accent-brand"
      />
      <div className="flex justify-between text-xs text-ink-soft">
        <span>{formatNaira(PRICE_MIN)}</span>
        <span>{formatNaira(PRICE_MAX)}</span>
      </div>
    </fieldset>

    <fieldset>
      <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">Transmission</legend>
      <div className="flex flex-wrap gap-2">
        {(['all', 'Automatic', 'Manual'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={filters.transmission === t}
            onClick={() => onChange({ ...filters, transmission: t })}
            className={chip(filters.transmission === t)}
          >
            {t === 'all' ? 'Any' : t}
          </button>
        ))}
      </div>
    </fieldset>

    <fieldset>
      <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">Seats</legend>
      <div className="grid grid-cols-4 gap-2">
        {(['all', 2, 4, 5] as const).map((s) => (
          <button
            key={String(s)}
            type="button"
            aria-pressed={filters.seats === s}
            onClick={() => onChange({ ...filters, seats: s })}
            className={chip(filters.seats === s)}
          >
            {s === 'all' ? 'Any' : `${s}+`}
          </button>
        ))}
      </div>
    </fieldset>

    {showSort && (
      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Sort by</legend>
        <div className="space-y-1">
          {SORT_OPTIONS.map((opt) => {
            const selected = filters.sortBy === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ ...filters, sortBy: opt.id })}
                className={cn(
                  'flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-sm font-semibold transition-colors',
                  selected ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:bg-surface'
                )}
              >
                {opt.label}
                {selected && <Check className="size-4 text-brand" />}
              </button>
            );
          })}
        </div>
      </fieldset>
    )}
  </div>
);

export const FilterModal: React.FC = () => {
  const { filterSheetOpen, setFilterSheetOpen, filters, setFilters, resetFilters, cars } = useAppState();
  const resultCount = filterCars(cars, filters).length;
  const close = () => setFilterSheetOpen(false);

  return (
    <Sheet
      open={filterSheetOpen}
      onClose={close}
      title="Filters"
      headerAction={
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          <RotateCcw className="size-4" />
          Reset
        </Button>
      }
      footer={
        <Button block size="lg" onClick={close} disabled={resultCount === 0}>
          {resultCount === 0 ? 'No cars match' : `Show ${resultCount} ${resultCount === 1 ? 'car' : 'cars'}`}
        </Button>
      }
    >
      <FilterPanel filters={filters} onChange={setFilters} />
    </Sheet>
  );
};

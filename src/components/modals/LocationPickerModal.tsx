import React from 'react';
import { Anchor, Building2, Check, Plane } from 'lucide-react';
import { AVAILABLE_LOCATIONS } from '../../data/cars';
import { useAppState } from '../../state/AppState';
import { cn } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

const ICONS: Record<string, React.ElementType> = { Plane, Anchor, Building: Building2 };

const TITLES = {
  pickup: 'Pick-up location',
  return: 'Return location',
  both: 'Where are you renting?'
};

export const LocationPickerModal: React.FC = () => {
  const { locationPicker, closeLocationPicker, selectLocation, pickupLocation, returnLocation } = useAppState();
  const current = locationPicker === 'return' ? returnLocation : pickupLocation;

  return (
    <Sheet
      open={locationPicker !== null}
      onClose={closeLocationPicker}
      title={locationPicker ? TITLES[locationPicker] : ''}
      description="Choose one of our concierge hubs"
    >
      <ul className="space-y-2" role="listbox" aria-label="Locations">
        {AVAILABLE_LOCATIONS.map((loc) => {
          const Icon = ICONS[loc.icon] ?? Building2;
          const selected = current === loc.name;
          return (
            <li key={loc.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => selectLocation(loc.name)}
                className={cn(
                  'flex min-h-16 w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors',
                  selected ? 'bg-ink text-white' : 'bg-surface hover:bg-surface-2'
                )}
              >
                <span
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-xl',
                    selected ? 'bg-white/10 text-white' : 'bg-white text-brand shadow-sm'
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{loc.name}</span>
                  <span className={cn('block text-xs', selected ? 'text-white/70' : 'text-ink-soft')}>{loc.city}</span>
                </span>
                {selected && <Check className="size-5 shrink-0 text-brand" />}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
};

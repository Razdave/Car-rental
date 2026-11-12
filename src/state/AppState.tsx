import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CARS_DATA, INITIAL_BOOKINGS, USER_PROFILE } from '../data/cars';
import type { Booking, Car, FilterOptions } from '../types/car';
import { fetchCars } from '../lib/api';
import { addDays, addHours, todayISO } from '../lib/dates';
import { DEFAULT_FILTERS } from '../lib/filters';
import { calculateQuote, type BookingDraft } from '../lib/pricing';
import { readStored, writeStored } from '../lib/storage';

export type FleetSource = 'loading' | 'live' | 'demo';
type LocationTarget = 'pickup' | 'return' | 'both';

export interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'success' | 'error';
}

export interface TripSearch {
  pickupDate: string;
  returnDate: string;
}

interface AppState {
  // Fleet
  cars: Car[];
  fleetSource: FleetSource;
  getCar: (id: string | undefined) => Car | undefined;

  // User
  profile: typeof USER_PROFILE;
  updateProfile: (patch: Partial<typeof USER_PROFILE>) => void;

  // Favorites
  favorites: string[];
  toggleFavorite: (carId: string) => void;

  // Bookings
  bookings: Booking[];
  addBooking: (booking: Booking) => void;
  updateBooking: (id: string, patch: Partial<Booking>) => void;
  cancelBooking: (id: string) => void;
  extendBooking: (id: string, amount: number) => void;

  // Search context shared by Home → Explore → Booking
  filters: FilterOptions;
  setFilters: React.Dispatch<React.SetStateAction<FilterOptions>>;
  resetFilters: () => void;
  trip: TripSearch;
  setTrip: (trip: TripSearch) => void;
  pickupLocation: string;
  returnLocation: string;

  // Checkout draft (survives a refresh via sessionStorage)
  draft: BookingDraft | null;
  setDraft: (draft: BookingDraft | null) => void;

  // Global overlays
  filterSheetOpen: boolean;
  setFilterSheetOpen: (open: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
  locationPicker: LocationTarget | null;
  openLocationPicker: (target: LocationTarget) => void;
  closeLocationPicker: () => void;
  selectLocation: (name: string) => void;

  // Feedback
  toasts: Toast[];
  showToast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

const AppStateContext = createContext<AppState | null>(null);

const DEFAULT_LOCATION = 'Beverly Hills - Wilshire Blvd';

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [cars, setCars] = useState<Car[]>(CARS_DATA);
  const [fleetSource, setFleetSource] = useState<FleetSource>('loading');

  const [profile, setProfile] = useState(() => readStored('aurevon.profile', USER_PROFILE));
  const [favorites, setFavorites] = useState<string[]>(() =>
    readStored('aurevon.favorites', ['car-audi-r8', 'car-range-rover'])
  );
  const [bookings, setBookings] = useState<Booking[]>(() => readStored('aurevon.bookings', INITIAL_BOOKINGS));

  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);
  const [trip, setTrip] = useState<TripSearch>(() => {
    const start = addDays(todayISO(), 1);
    return { pickupDate: start, returnDate: addDays(start, 3) };
  });
  const [pickupLocation, setPickupLocation] = useState(() => readStored('aurevon.pickup', DEFAULT_LOCATION));
  const [returnLocation, setReturnLocation] = useState(() => readStored('aurevon.return', DEFAULT_LOCATION));

  const [draft, setDraftState] = useState<BookingDraft | null>(() => readStored('aurevon.draft', null, 'session'));

  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [locationPicker, setLocationPicker] = useState<LocationTarget | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  // Load the live fleet; keep the bundled demo fleet if the API is unreachable.
  useEffect(() => {
    let active = true;
    fetchCars()
      .then((apiCars) => {
        if (!active) return;
        setCars(apiCars);
        setFleetSource('live');
      })
      .catch((error: unknown) => {
        console.warn('Fleet API unavailable, using bundled demo fleet. Start it with `npm run server`.', error);
        if (active) setFleetSource('demo');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => writeStored('aurevon.favorites', favorites), [favorites]);
  useEffect(() => writeStored('aurevon.bookings', bookings), [bookings]);
  useEffect(() => writeStored('aurevon.profile', profile), [profile]);
  useEffect(() => writeStored('aurevon.pickup', pickupLocation), [pickupLocation]);
  useEffect(() => writeStored('aurevon.return', returnLocation), [returnLocation]);

  const setDraft = useCallback((next: BookingDraft | null) => {
    setDraftState(next);
    writeStored('aurevon.draft', next, 'session');
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const showToast = useCallback(
    (message: string, tone: Toast['tone'] = 'default') => {
      const id = ++toastId.current;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismissToast(id), 3200);
    },
    [dismissToast]
  );

  const getCar = useCallback((id: string | undefined) => cars.find((c) => c.id === id), [cars]);

  const toggleFavorite = useCallback(
    (carId: string) => {
      const saved = !favorites.includes(carId);
      setFavorites((prev) => (saved ? [...prev.filter((id) => id !== carId), carId] : prev.filter((id) => id !== carId)));
      showToast(saved ? 'Saved to favourites' : 'Removed from favourites', saved ? 'success' : 'default');
    },
    [favorites, showToast]
  );

  const addBooking = useCallback((booking: Booking) => setBookings((prev) => [booking, ...prev]), []);

  const updateBooking = useCallback(
    (id: string, patch: Partial<Booking>) =>
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b))),
    []
  );

  const cancelBooking = useCallback(
    (id: string) => updateBooking(id, { status: 'cancelled', managementStatus: 'cancelled' }),
    [updateBooking]
  );

  /** Extends by whole days (daily rentals) or hours (hourly rentals) and re-prices with the same rules as checkout. */
  const extendBooking = useCallback((id: string, amount: number) => {
    setBookings((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const unit = b.durationUnit ?? 'day';
        const next =
          unit === 'day'
            ? { date: addDays(b.returnDate, amount), time: b.returnTime }
            : addHours(b.returnDate, b.returnTime, amount);
        const quote = calculateQuote({
          car: b.car,
          durationUnit: unit,
          pickupDate: b.pickupDate,
          pickupTime: b.pickupTime,
          returnDate: next.date,
          returnTime: next.time,
          extras: b.extraServices
        });
        return {
          ...b,
          returnDate: next.date,
          returnTime: next.time,
          durationValue: quote.durationValue,
          totalDays: quote.totalDays,
          basePrice: quote.basePrice,
          taxAmount: quote.taxAmount,
          totalAmount: Math.max(0, quote.totalAmount - b.discount)
        };
      })
    );
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const selectLocation = useCallback(
    (name: string) => {
      if (locationPicker === 'pickup' || locationPicker === 'both') setPickupLocation(name);
      if (locationPicker === 'return' || locationPicker === 'both') setReturnLocation(name);
      setLocationPicker(null);
    },
    [locationPicker]
  );

  const value = useMemo<AppState>(
    () => ({
      cars,
      fleetSource,
      getCar,
      profile,
      updateProfile: (patch) => setProfile((p) => ({ ...p, ...patch })),
      favorites,
      toggleFavorite,
      bookings,
      addBooking,
      updateBooking,
      cancelBooking,
      extendBooking,
      filters,
      setFilters,
      resetFilters,
      trip,
      setTrip,
      pickupLocation,
      returnLocation,
      draft,
      setDraft,
      filterSheetOpen,
      setFilterSheetOpen,
      notificationsOpen,
      setNotificationsOpen,
      locationPicker,
      openLocationPicker: setLocationPicker,
      closeLocationPicker: () => setLocationPicker(null),
      selectLocation,
      toasts,
      showToast,
      dismissToast
    }),
    [
      cars, fleetSource, getCar, profile, favorites, toggleFavorite, bookings, addBooking, updateBooking,
      cancelBooking, extendBooking, filters, resetFilters, trip, pickupLocation, returnLocation, draft, setDraft,
      filterSheetOpen, notificationsOpen, locationPicker, selectLocation, toasts, showToast, dismissToast
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>.');
  return ctx;
}

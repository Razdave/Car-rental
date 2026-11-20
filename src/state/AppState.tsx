import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AVAILABLE_LOCATIONS, CARS_DATA } from '../data/cars';
import type { Booking, Car, CustomerVerification, FilterOptions } from '../types/car';
import { backend, type Profile } from '../lib/backend';
import { addDays, todayISO } from '../lib/dates';
import { DEFAULT_FILTERS } from '../lib/filters';
import type { BookingDraft } from '../lib/pricing';
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
  /** Cars that are booked, blocked or out of service for the searched dates (live). */
  unavailableIds: string[];

  // Account
  profile: Profile | null;
  authReady: boolean;
  isStaff: boolean;
  setProfile: (p: Profile | null) => void;
  /** Screening status of the signed-in customer (null while loading or signed out). */
  verification: CustomerVerification | null;
  refreshVerification: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;

  // Favorites
  favorites: string[];
  toggleFavorite: (carId: string) => void;

  // Bookings
  bookings: Booking[];
  upsertBooking: (booking: Booking) => void;
  refreshBookings: () => Promise<void>;
  cancelBooking: (id: string) => Promise<boolean>;
  extendBooking: (id: string, amount: number) => Promise<boolean>;

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

const DEFAULT_LOCATION = 'Calabar - Marian Road';
/** A hub saved in the browser may no longer exist (e.g. the old US hubs); fall back to the default. */
const knownLocation = (name: string) => (AVAILABLE_LOCATIONS.some((l) => l.name === name) ? name : DEFAULT_LOCATION);
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [cars, setCars] = useState<Car[]>(CARS_DATA);
  const [fleetSource, setFleetSource] = useState<FleetSource>('loading');
  const [unavailableIds, setUnavailableIds] = useState<string[]>([]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => readStored('aurevon.guestFavorites', []));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [verification, setVerification] = useState<CustomerVerification | null>(null);

  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);
  const [trip, setTrip] = useState<TripSearch>(() => {
    const start = addDays(todayISO(), 1);
    return { pickupDate: start, returnDate: addDays(start, 3) };
  });
  const [pickupLocation, setPickupLocation] = useState(() => knownLocation(readStored('aurevon.pickup', DEFAULT_LOCATION)));
  const [returnLocation, setReturnLocation] = useState(() => knownLocation(readStored('aurevon.return', DEFAULT_LOCATION)));

  const [draft, setDraftState] = useState<BookingDraft | null>(() => readStored('aurevon.draft', null, 'session'));

  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [locationPicker, setLocationPicker] = useState<LocationTarget | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const showToast = useCallback(
    (message: string, tone: Toast['tone'] = 'default') => {
      const id = ++toastId.current;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismissToast(id), 3600);
    },
    [dismissToast]
  );

  // ---- Fleet (live) ----
  const loadCars = useCallback(async () => {
    try {
      const result = await backend.listCars();
      setCars(result.cars);
      setFleetSource(result.live ? 'live' : 'demo');
    } catch (error) {
      console.warn('Fleet unavailable, using bundled sample fleet.', error);
      setFleetSource('demo');
    }
  }, []);

  const loadAvailability = useCallback(async () => {
    try {
      setUnavailableIds(
        await backend.unavailableCarIds({ pickupDate: trip.pickupDate, pickupTime: '10:00 AM', returnDate: trip.returnDate, returnTime: '10:00 AM' })
      );
    } catch (error) {
      console.warn('Could not load availability.', error);
    }
  }, [trip]);

  useEffect(() => {
    void loadCars();
  }, [loadCars]);

  useEffect(() => {
    void loadAvailability();
    return backend.onFleetChange(() => {
      void loadCars();
      void loadAvailability();
    });
  }, [loadAvailability, loadCars]);

  // ---- Account ----
  useEffect(() => {
    let active = true;
    backend
      .getProfile()
      .then((p) => active && setProfile(p))
      .catch(() => active && setProfile(null))
      .finally(() => active && setAuthReady(true));
    const off = backend.onAuthChange((p) => setProfile(p));
    return () => {
      active = false;
      off();
    };
  }, []);

  // ---- Bookings & favourites follow the signed-in user ----
  const refreshBookings = useCallback(async () => {
    try {
      setBookings(await backend.listMyBookings());
    } catch (error) {
      console.warn('Could not load bookings.', error);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    void refreshBookings();
    if (profile) {
      backend.listFavorites().then((saved) => {
        // Merge anything saved while signed out.
        const guest = readStored<string[]>('aurevon.guestFavorites', []);
        guest.filter((id) => !saved.includes(id)).forEach((id) => void backend.setFavorite(id, true));
        setFavorites([...new Set([...saved, ...guest])]);
        writeStored('aurevon.guestFavorites', null);
      }).catch(() => {});
    }
    return backend.onMyBookingsChange(() => void refreshBookings());
  }, [authReady, profile?.id, refreshBookings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!profile) writeStored('aurevon.guestFavorites', favorites);
  }, [favorites, profile]);

  const refreshVerification = useCallback(async () => {
    try {
      setVerification(await backend.getMyVerification());
    } catch {
      setVerification(null);
    }
  }, []);

  // Reload screening status on sign-in and whenever staff review it (bookings channel carries it in demo mode).
  useEffect(() => {
    if (!profile) {
      setVerification(null);
      return;
    }
    void refreshVerification();
    return backend.onMyBookingsChange(() => void refreshVerification());
  }, [profile?.id, refreshVerification]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => writeStored('aurevon.pickup', pickupLocation), [pickupLocation]);
  useEffect(() => writeStored('aurevon.return', returnLocation), [returnLocation]);

  const setDraft = useCallback((next: BookingDraft | null) => {
    setDraftState(next);
    writeStored('aurevon.draft', next, 'session');
  }, []);

  const getCar = useCallback((id: string | undefined) => cars.find((c) => c.id === id), [cars]);

  const toggleFavorite = useCallback(
    (carId: string) => {
      const saved = !favorites.includes(carId);
      setFavorites((prev) => (saved ? [...prev.filter((id) => id !== carId), carId] : prev.filter((id) => id !== carId)));
      if (profile) void backend.setFavorite(carId, saved).catch(() => showToast('Couldn’t save that change', 'error'));
      showToast(saved ? 'Saved to favourites' : 'Removed from favourites', saved ? 'success' : 'default');
    },
    [favorites, profile, showToast]
  );

  const upsertBooking = useCallback(
    (booking: Booking) => setBookings((prev) => [booking, ...prev.filter((b) => b.id !== booking.id)]),
    []
  );

  const cancelBooking = useCallback(
    async (id: string) => {
      try {
        upsertBooking(await backend.cancelBooking(id));
        showToast('Booking cancelled — a confirmation has been sent');
        return true;
      } catch (error) {
        showToast(errorMessage(error), 'error');
        return false;
      }
    },
    [showToast, upsertBooking]
  );

  const extendBooking = useCallback(
    async (id: string, amount: number) => {
      try {
        upsertBooking(await backend.extendBooking(id, amount));
        return true;
      } catch (error) {
        showToast(errorMessage(error), 'error');
        return false;
      }
    },
    [showToast, upsertBooking]
  );

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      try {
        setProfile(await backend.updateProfile(patch));
      } catch (error) {
        showToast(errorMessage(error), 'error');
        throw error;
      }
    },
    [showToast]
  );

  const signOut = useCallback(async () => {
    await backend.signOut();
    setProfile(backend.kind === 'local' ? await backend.getProfile() : null);
    setBookings(backend.kind === 'local' ? await backend.listMyBookings() : []);
    setFavorites([]);
    showToast('Signed out');
  }, [showToast]);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const selectLocation = useCallback(
    (name: string) => {
      if (locationPicker === 'pickup' || locationPicker === 'both') setPickupLocation(name);
      if (locationPicker === 'return' || locationPicker === 'both') setReturnLocation(name);
      setLocationPicker(null);
    },
    [locationPicker]
  );

  const isStaff = Boolean(profile && profile.role !== 'customer');

  const value = useMemo<AppState>(
    () => ({
      cars, fleetSource, getCar, unavailableIds,
      profile, authReady, isStaff, setProfile, updateProfile, signOut, verification, refreshVerification,
      favorites, toggleFavorite,
      bookings, upsertBooking, refreshBookings, cancelBooking, extendBooking,
      filters, setFilters, resetFilters, trip, setTrip, pickupLocation, returnLocation,
      draft, setDraft,
      filterSheetOpen, setFilterSheetOpen, notificationsOpen, setNotificationsOpen,
      locationPicker, openLocationPicker: setLocationPicker, closeLocationPicker: () => setLocationPicker(null), selectLocation,
      toasts, showToast, dismissToast
    }),
    [
      cars, fleetSource, getCar, unavailableIds, profile, authReady, isStaff, updateProfile, signOut, verification, refreshVerification, favorites, toggleFavorite,
      bookings, upsertBooking, refreshBookings, cancelBooking, extendBooking, filters, resetFilters, trip, pickupLocation,
      returnLocation, draft, setDraft, filterSheetOpen, notificationsOpen, locationPicker, selectLocation, toasts, showToast, dismissToast
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>.');
  return ctx;
}

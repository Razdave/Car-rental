import React, { useState } from 'react';
import { CARS_DATA, INITIAL_BOOKINGS, AVAILABLE_LOCATIONS } from './data/cars';
import { Car, Booking, FilterOptions, ExtraService, DriverInfo } from './types/car';
import { MobileShell, TabId } from './components/layout/MobileShell';
import { HomeScreen } from './components/screens/HomeScreen';
import { ExploreScreen } from './components/screens/ExploreScreen';
import { CarDetailsScreen } from './components/screens/CarDetailsScreen';
import { BookingScreen } from './components/screens/BookingScreen';
import { PaymentScreen } from './components/screens/PaymentScreen';
import { ConfirmationScreen } from './components/screens/ConfirmationScreen';
import { MyBookingsScreen } from './components/screens/MyBookingsScreen';
import { ProfileScreen } from './components/screens/ProfileScreen';
import { FavoritesScreen } from './components/screens/FavoritesScreen';
import { FilterModal } from './components/modals/FilterModal';
import { LocationPickerModal } from './components/modals/LocationPickerModal';
import { NotificationModal } from './components/modals/NotificationModal';

export default function App() {
  // Navigation & Screen State
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);

  // Booking Flow State
  type BookingStage = 'idle' | 'details' | 'payment' | 'confirmation';
  const [bookingStage, setBookingStage] = useState<BookingStage>('idle');
  const [bookingDraft, setBookingDraft] = useState<{
    car: Car;
    pickupDate: string;
    returnDate: string;
    pickupTime: string;
    returnTime: string;
    pickupLocation: string;
    returnLocation: string;
    totalDays: number;
    basePrice: number;
    extraServices: ExtraService[];
    taxAmount: number;
    totalAmount: number;
    driverInfo: DriverInfo;
  } | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);

  // Data State
  const [cars] = useState<Car[]>(CARS_DATA);
  const [favorites, setFavorites] = useState<string[]>(['car-audi-r8', 'car-range-rover']);
  const [bookings, setBookings] = useState<Booking[]>(INITIAL_BOOKINGS);

  // Location State
  const [pickupLocation, setPickupLocation] = useState<string>('Beverly Hills - Wilshire Blvd');
  const [returnLocation, setReturnLocation] = useState<string>('Beverly Hills - Wilshire Blvd');
  const [locationPickerState, setLocationPickerState] = useState<{
    isOpen: boolean;
    type: 'header' | 'pickup' | 'return';
  }>({ isOpen: false, type: 'header' });

  // Filters State
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    search: '',
    category: 'All',
    minPrice: 150,
    maxPrice: 400,
    transmission: 'all',
    seats: 'all',
    sortBy: 'recommended'
  });

  // Notifications Modal State
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Handlers
  const handleToggleFavorite = (carId: string) => {
    setFavorites((prev) =>
      prev.includes(carId) ? prev.filter((id) => id !== carId) : [...prev, carId]
    );
  };

  const handleSelectCar = (car: Car) => {
    setSelectedCar(car);
    setBookingStage('idle');
  };

  const handleStartBooking = (car: Car) => {
    setSelectedCar(car);
    setBookingStage('details');
  };

  const handleProceedToPayment = (draft: typeof bookingDraft) => {
    setBookingDraft(draft);
    setBookingStage('payment');
  };

  const handlePaymentSuccess = (newBooking: Booking) => {
    setBookings((prev) => [newBooking, ...prev]);
    setConfirmedBooking(newBooking);
    setBookingStage('confirmation');
  };

  const handleCancelBooking = (bookingId: string) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: 'cancelled' } : b))
    );
  };

  const handleExtendBooking = (bookingId: string, additionalDays: number) => {
    setBookings((prev) =>
      prev.map((b) => {
        if (b.id === bookingId) {
          const addedBase = b.car.pricePerDay * additionalDays;
          return {
            ...b,
            totalDays: b.totalDays + additionalDays,
            basePrice: b.basePrice + addedBase,
            totalAmount: b.totalAmount + addedBase
          };
        }
        return b;
      })
    );
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      category: 'All',
      minPrice: 150,
      maxPrice: 400,
      transmission: 'all',
      seats: 'all',
      sortBy: 'recommended'
    });
  };

  const handleLocationSelect = (locName: string) => {
    if (locationPickerState.type === 'pickup' || locationPickerState.type === 'header') {
      setPickupLocation(locName);
    }
    if (locationPickerState.type === 'return' || locationPickerState.type === 'header') {
      setReturnLocation(locName);
    }
    setLocationPickerState({ isOpen: false, type: 'header' });
  };

  // Determine which screen is shown
  const isDeepScreen = Boolean(selectedCar || bookingStage !== 'idle');

  const renderContent = () => {
    // 1. Booking Confirmation Screen
    if (bookingStage === 'confirmation' && confirmedBooking) {
      return (
        <ConfirmationScreen
          booking={confirmedBooking}
          onGoToBookings={() => {
            setBookingStage('idle');
            setSelectedCar(null);
            setBookingDraft(null);
            setActiveTab('bookings');
          }}
          onGoHome={() => {
            setBookingStage('idle');
            setSelectedCar(null);
            setBookingDraft(null);
            setActiveTab('home');
          }}
        />
      );
    }

    // 2. Payment Screen
    if (bookingStage === 'payment' && bookingDraft) {
      return (
        <PaymentScreen
          bookingDraft={bookingDraft}
          onBack={() => setBookingStage('details')}
          onPaymentSuccess={handlePaymentSuccess}
        />
      );
    }

    // 3. Booking Details Screen
    if (bookingStage === 'details' && selectedCar) {
      return (
        <BookingScreen
          car={selectedCar}
          pickupLocation={pickupLocation}
          returnLocation={returnLocation}
          onOpenLocationPicker={(type) => setLocationPickerState({ isOpen: true, type })}
          onBack={() => setBookingStage('idle')}
          onProceedToPayment={handleProceedToPayment}
        />
      );
    }

    // 4. Car Details Screen
    if (selectedCar) {
      return (
        <CarDetailsScreen
          car={selectedCar}
          isFavorite={favorites.includes(selectedCar.id)}
          onToggleFavorite={handleToggleFavorite}
          onBack={() => setSelectedCar(null)}
          onStartBooking={handleStartBooking}
        />
      );
    }

    // 5. Main Tab Screens
    switch (activeTab) {
      case 'home':
        return (
          <HomeScreen
            cars={cars}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onSelectCar={handleSelectCar}
            onNavigateToExplore={() => setActiveTab('explore')}
            onOpenFilter={() => setIsFilterModalOpen(true)}
            onOpenLocation={() => setLocationPickerState({ isOpen: true, type: 'header' })}
            onOpenNotifications={() => setIsNotificationsOpen(true)}
            selectedLocation={pickupLocation}
          />
        );

      case 'explore':
        return (
          <ExploreScreen
            cars={cars}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onSelectCar={handleSelectCar}
            onOpenFilter={() => setIsFilterModalOpen(true)}
            onOpenLocation={() => setLocationPickerState({ isOpen: true, type: 'header' })}
            filters={filters}
            onFilterChange={setFilters}
            selectedLocation={pickupLocation}
          />
        );

      case 'favorites':
        return (
          <FavoritesScreen
            cars={cars}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onSelectCar={handleSelectCar}
            onExplore={() => setActiveTab('explore')}
          />
        );

      case 'bookings':
        return (
          <MyBookingsScreen
            bookings={bookings}
            onSelectCar={handleSelectCar}
            onExplore={() => setActiveTab('explore')}
            onCancelBooking={handleCancelBooking}
            onExtendBooking={handleExtendBooking}
          />
        );

      case 'profile':
        return (
          <ProfileScreen
            onLogout={() => {
              alert('Logged out of session. Switched to Guest.');
            }}
            favoritesCount={favorites.length}
            bookingsCount={bookings.length}
          />
        );

      default:
        return null;
    }
  };

  const activeBookingsCount = bookings.filter((b) => b.status === 'active').length;

  return (
    <MobileShell
      activeTab={activeTab}
      onTabChange={(tab) => {
        setSelectedCar(null);
        setBookingStage('idle');
        setActiveTab(tab);
      }}
      favoritesCount={favorites.length}
      activeBookingsCount={activeBookingsCount}
      hideBottomNav={isDeepScreen}
    >
      {renderContent()}

      {/* Global Modals */}
      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        onReset={handleResetFilters}
        carCount={cars.length}
      />

      <LocationPickerModal
        isOpen={locationPickerState.isOpen}
        onClose={() => setLocationPickerState({ ...locationPickerState, isOpen: false })}
        selectedLocation={
          locationPickerState.type === 'return' ? returnLocation : pickupLocation
        }
        onSelectLocation={handleLocationSelect}
        title={
          locationPickerState.type === 'return'
            ? 'Select Drop-off Hub'
            : locationPickerState.type === 'pickup'
            ? 'Select Pick-up Hub'
            : 'Select Preferred City Hub'
        }
      />

      <NotificationModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onSelectBooking={(bId) => {
          const found = bookings.find((b) => b.id === bId);
          if (found) {
            setActiveTab('bookings');
          }
        }}
      />
    </MobileShell>
  );
}

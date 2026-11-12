import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppStateProvider } from './state/AppState';
import { AppShell } from './components/layout/AppShell';
import { HomeScreen } from './components/screens/HomeScreen';
import { ExploreScreen } from './components/screens/ExploreScreen';
import { CarDetailsScreen } from './components/screens/CarDetailsScreen';
import { BookingScreen } from './components/screens/BookingScreen';
import { PaymentScreen } from './components/screens/PaymentScreen';
import { ConfirmationScreen } from './components/screens/ConfirmationScreen';
import { MyBookingsScreen } from './components/screens/MyBookingsScreen';
import { FavoritesScreen } from './components/screens/FavoritesScreen';
import { ProfileScreen } from './components/screens/ProfileScreen';
import { NotFoundScreen } from './components/screens/NotFoundScreen';

/**
 * Routes
 *   /                      Home + trip search
 *   /explore               Fleet with search, filters, sort
 *   /cars/:carId           Vehicle details
 *   /cars/:carId/book      Step 1 — trip details
 *   /checkout              Step 2 — payment (needs a draft from step 1)
 *   /bookings              My trips (?tab=active|upcoming|completed|cancelled)
 *   /bookings/:bookingId   Booking detail; ?new=1 shows the confirmation state
 *   /favorites, /profile
 */
const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'explore', element: <ExploreScreen /> },
      { path: 'cars/:carId', element: <CarDetailsScreen /> },
      { path: 'cars/:carId/book', element: <BookingScreen /> },
      { path: 'checkout', element: <PaymentScreen /> },
      { path: 'bookings', element: <MyBookingsScreen /> },
      { path: 'bookings/:bookingId', element: <ConfirmationScreen /> },
      { path: 'favorites', element: <FavoritesScreen /> },
      { path: 'profile', element: <ProfileScreen /> },
      { path: '*', element: <NotFoundScreen /> }
    ]
  }
]);

export default function App() {
  return (
    <AppStateProvider>
      <RouterProvider router={router} />
    </AppStateProvider>
  );
}

import React, { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
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
import { SignInScreen } from './components/screens/SignInScreen';
import { MessagesScreen } from './components/screens/MessagesScreen';
import { AgreementScreen } from './components/screens/AgreementScreen';
import { VerifyScreen } from './components/screens/VerifyScreen';

const AdminScreen = lazy(() => import('./components/admin/AdminScreen'));
const Loading = () => (
  <div className="flex min-h-dvh items-center justify-center">
    <Loader2 className="size-8 animate-spin text-ink-soft" />
  </div>
);

/**
 * Routes
 *   /                      Home + trip search
 *   /explore               Fleet with search, filters, sort
 *   /cars/:carId           Vehicle details
 *   /cars/:carId/book      Step 1 — trip details
 *   /checkout              Step 2 — payment (needs a draft from step 1)
 *   /bookings              My trips (?tab=active|upcoming|completed|cancelled)
 *   /bookings/:bookingId   Booking detail; ?new=1 shows the confirmation state
 *   /bookings/:bookingId/agreement   Digital rental agreement (sign / print)
 *   /messages              Chat with the rental team (?booking=ID)
 *   /signin                Email one-time code sign-in
 *   /verify                Customer screening: licence, ID, selfie, employment, driving record (?next=)
 *   /favorites, /profile
 *   /admin                 Staff dashboard (?tab=overview|bookings|verification|calendar|vehicles|customers|experience|inbox|reviews|notifications)
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
      { path: 'bookings/:bookingId/agreement', element: <AgreementScreen /> },
      { path: 'messages', element: <MessagesScreen /> },
      { path: 'signin', element: <SignInScreen /> },
      { path: 'verify', element: <VerifyScreen /> },
      { path: 'favorites', element: <FavoritesScreen /> },
      { path: 'profile', element: <ProfileScreen /> },
      { path: '*', element: <NotFoundScreen /> }
    ]
  },
  {
    path: '/admin',
    element: (
      <Suspense fallback={<Loading />}>
        <AdminScreen />
      </Suspense>
    )
  }
]);

export default function App() {
  return (
    <AppStateProvider>
      <RouterProvider router={router} />
    </AppStateProvider>
  );
}

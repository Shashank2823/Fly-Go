import { createBrowserRouter } from 'react-router';
import { GuestOnly, RequireAuth } from '../features/auth/route-guards';
import { AppLayout } from '../layouts/AppLayout';
import { BookingDetailPage } from '../pages/BookingDetailPage';
import { BookingHoldPage } from '../pages/BookingHoldPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { FlightResultsPage } from '../pages/FlightResultsPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { MyBookingsPage } from '../pages/MyBookingsPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PassengersPage } from '../pages/PassengersPage';
import { ProfilePage } from '../pages/ProfilePage';
import { RegisterPage } from '../pages/RegisterPage';
import { SeatSelectionPage } from '../pages/SeatSelectionPage';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'flights', element: <FlightResultsPage /> },
      { path: 'flights/:flightId/seats', element: <SeatSelectionPage /> },
      {
        path: 'book/:reference',
        element: (
          <RequireAuth>
            <BookingHoldPage />
          </RequireAuth>
        ),
      },
      {
        path: 'book/:reference/passengers',
        element: (
          <RequireAuth>
            <PassengersPage />
          </RequireAuth>
        ),
      },
      {
        path: 'book/:reference/checkout',
        element: (
          <RequireAuth>
            <CheckoutPage />
          </RequireAuth>
        ),
      },
      {
        path: 'bookings',
        element: (
          <RequireAuth>
            <MyBookingsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'bookings/:reference',
        element: (
          <RequireAuth>
            <BookingDetailPage />
          </RequireAuth>
        ),
      },
      {
        path: 'login',
        element: (
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        ),
      },
      {
        path: 'register',
        element: (
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        ),
      },
      {
        path: 'profile',
        element: (
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

import { createBrowserRouter } from 'react-router';
import type { RouteHandle } from './route-title';
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
import { NotificationsPage } from '../pages/NotificationsPage';
import { PassengersPage } from '../pages/PassengersPage';
import { ProfilePage } from '../pages/ProfilePage';
import { RegisterPage } from '../pages/RegisterPage';
import { RouteErrorPage } from '../pages/RouteErrorPage';
import { SeatSelectionPage } from '../pages/SeatSelectionPage';

const title = (t: RouteHandle['title']): RouteHandle => ({ title: t });

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    // Fallback if the layout itself fails; page errors are caught below, inside the layout.
    errorElement: <RouteErrorPage />,
    children: [
      {
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'flights', element: <FlightResultsPage />, handle: title('Flights') },
          {
            path: 'flights/:flightId/seats',
            element: <SeatSelectionPage />,
            handle: title('Choose seats'),
          },
          {
            path: 'book/:reference',
            handle: title((p) => `Seat hold ${p.reference}`),
            element: (
              <RequireAuth>
                <BookingHoldPage />
              </RequireAuth>
            ),
          },
          {
            path: 'book/:reference/passengers',
            handle: title('Passenger details'),
            element: (
              <RequireAuth>
                <PassengersPage />
              </RequireAuth>
            ),
          },
          {
            path: 'book/:reference/checkout',
            handle: title('Checkout'),
            element: (
              <RequireAuth>
                <CheckoutPage />
              </RequireAuth>
            ),
          },
          {
            path: 'bookings',
            handle: title('My trips'),
            element: (
              <RequireAuth>
                <MyBookingsPage />
              </RequireAuth>
            ),
          },
          {
            path: 'bookings/:reference',
            handle: title((p) => `Booking ${p.reference}`),
            element: (
              <RequireAuth>
                <BookingDetailPage />
              </RequireAuth>
            ),
          },
          {
            path: 'notifications',
            handle: title('Notifications'),
            element: (
              <RequireAuth>
                <NotificationsPage />
              </RequireAuth>
            ),
          },
          {
            path: 'login',
            handle: title('Sign in'),
            element: (
              <GuestOnly>
                <LoginPage />
              </GuestOnly>
            ),
          },
          {
            path: 'register',
            handle: title('Create account'),
            element: (
              <GuestOnly>
                <RegisterPage />
              </GuestOnly>
            ),
          },
          {
            path: 'profile',
            handle: title('Your profile'),
            element: (
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            ),
          },
          { path: '*', element: <NotFoundPage />, handle: title('Page not found') },
        ],
      },
    ],
  },
]);

import { createBrowserRouter } from 'react-router';
import { GuestOnly, RequireAuth } from '../features/auth/route-guards';
import { AppLayout } from '../layouts/AppLayout';
import { BookingHoldPage } from '../pages/BookingHoldPage';
import { FlightResultsPage } from '../pages/FlightResultsPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
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

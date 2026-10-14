import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { useCurrentUser } from '../api/auth';
import { Logo } from '../components/Logo';
import { UserMenu } from '../features/auth/UserMenu';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { cn } from '../lib/cn';

/** Only implemented routes are linked. */
const NAV = [
  { to: '/', label: 'Flights', match: ['/', '/flights'], auth: false },
  { to: '/bookings', label: 'My trips', match: ['/bookings', '/book/'], auth: true },
];

const FOOTER_COLUMNS = [
  { title: 'Company', links: ['About us', 'Careers', 'Contact'] },
  { title: 'Help', links: ['Help centre', 'Baggage', 'Travel safety'] },
  { title: 'Legal', links: ['Privacy policy', 'Terms of service'] },
];

function SessionArea() {
  const { data: user, isPending } = useCurrentUser();
  if (isPending)
    return <span className="size-9 animate-pulse rounded-full bg-navy-50" aria-hidden />;
  if (user)
    return (
      <div className="flex items-center gap-1">
        <NotificationBell />
        <UserMenu user={user} />
      </div>
    );
  return (
    <div className="flex items-center gap-1.5">
      <Link
        to="/login"
        className="rounded-xl px-3.5 py-2 text-sm font-semibold text-navy-900 hover:bg-navy-50"
      >
        Sign in
      </Link>
      <Link
        to="/register"
        className="rounded-xl bg-navy-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-navy-800"
      >
        Sign up
      </Link>
    </div>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  const { data: user } = useCurrentUser();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-8">
            <Logo />
            <nav aria-label="Main" className="hidden gap-1 sm:flex">
              {NAV.filter((item) => !item.auth || user).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={() =>
                    cn(
                      'rounded-lg px-3 py-2 text-sm font-semibold',
                      item.match.some((m) =>
                        m === '/' ? pathname === '/' : pathname.startsWith(m),
                      )
                        ? 'bg-navy-50 text-navy-900'
                        : 'text-muted hover:text-navy-900',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <SessionArea />
        </div>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <ScrollRestoration />

      <footer className="bg-navy-950 text-navy-200">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo inverted />
            <p className="mt-3 max-w-xs text-sm leading-relaxed">
              Book flights, pick your exact seat and keep your e-tickets in one place.
            </p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="mb-3 text-sm font-semibold text-white">{col.title}</p>
              <ul className="space-y-2 text-sm">
                {col.links.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs">
            © {new Date().getFullYear()} FlyGo · Demo project — airlines, flights and fares are
            sample data, not live airline inventory.
          </p>
        </div>
      </footer>
    </div>
  );
}

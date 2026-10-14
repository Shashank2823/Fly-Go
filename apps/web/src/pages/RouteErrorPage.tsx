import { useEffect } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { formatTitle } from '../app/route-title';
import { Button } from '../components/ui/Button';
import { NotFoundPage } from './NotFoundPage';

/**
 * Shown when a page throws while rendering. The header stays usable (this renders inside the
 * layout), the traveller gets a way forward, and the details go to the console, not the screen.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (!notFound) console.error('Unhandled route error', error);
    document.title = formatTitle(notFound ? 'Page not found' : 'Something went wrong');
  }, [error, notFound]);

  if (notFound) return <NotFoundPage />;
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center" role="alert">
      <p className="font-mono text-sm font-semibold text-saffron-600">Error</p>
      <h1 className="mt-2 text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-muted">
        This page hit an unexpected problem. Your bookings are safe — try reloading, or head back to
        the home page.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={() => window.location.reload()}>Reload page</Button>
        <Link
          to="/"
          className="inline-flex items-center rounded-xl px-4 text-sm font-semibold text-navy-700 hover:bg-navy-50"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}

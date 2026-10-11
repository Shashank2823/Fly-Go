import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { useCurrentUser } from '../../api/auth';
import { safeRedirect } from './safe-redirect';

function FullPageSpinner() {
  return (
    <div className="flex justify-center py-24" aria-busy="true" aria-label="Loading">
      <span className="size-8 animate-spin rounded-full border-4 border-navy-100 border-t-navy-700" />
    </div>
  );
}

/** UX-only gate; the API enforces authentication on every protected endpoint. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();
  const location = useLocation();
  if (isPending) return <FullPageSpinner />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}

/**
 * Keeps signed-in users away from the login/register pages. This also performs the
 * post-login redirect (honouring a safe `?next=`), since it reacts to the new session first.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();
  const [params] = useSearchParams();
  if (isPending) return <FullPageSpinner />;
  if (user) return <Navigate to={safeRedirect(params.get('next'))} replace />;
  return children;
}

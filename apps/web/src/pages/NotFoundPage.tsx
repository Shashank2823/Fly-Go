import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="font-mono text-sm font-semibold text-saffron-600">404</p>
      <h1 className="mt-2 text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-muted">The page you are looking for does not exist.</p>
      <Link
        to="/"
        className="mt-6 inline-block text-sm font-semibold text-navy-700 hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}

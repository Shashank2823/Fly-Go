import { useCurrentUser } from '../api/auth';
import { useCountries } from '../api/reference';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';

export function ProfilePage() {
  const { data: user } = useCurrentUser();
  const countries = useCountries();
  if (!user) return null;
  const nationality =
    countries.data?.find((c) => c.code === user.nationality)?.name ?? user.nationality;

  const rows: [string, string][] = [
    ['Full name', user.fullName],
    ['Email', user.email],
    ['Phone', user.phone ?? '—'],
    ['Nationality', nationality],
    ['Pricing market', `${user.market.code} · prices in ${user.market.currency}`],
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">Profile</h1>
      <Card>
        <dl className="divide-y divide-line">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-1 py-3 sm:grid-cols-3">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="text-sm font-medium sm:col-span-2">{value}</dd>
            </div>
          ))}
          <div className="grid gap-1 py-3 sm:grid-cols-3">
            <dt className="text-sm text-muted">Roles</dt>
            <dd className="flex gap-2 sm:col-span-2">
              {user.roles.map((r) => (
                <Badge key={r} tone="navy">
                  {r}
                </Badge>
              ))}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

import { ArrowRight, Armchair, CreditCard, Search } from 'lucide-react';
import { Link } from 'react-router';
import { SearchForm } from '../features/search/SearchForm';
import { todayIso } from '../lib/format';
import { toSearchParams } from '../lib/search-params';

const POPULAR = [
  { from: 'DEL', to: 'BOM', fromCity: 'New Delhi', toCity: 'Mumbai' },
  { from: 'BOM', to: 'GOX', fromCity: 'Mumbai', toCity: 'Goa' },
  { from: 'BLR', to: 'DEL', fromCity: 'Bengaluru', toCity: 'New Delhi' },
  { from: 'DEL', to: 'DXB', fromCity: 'New Delhi', toCity: 'Dubai' },
  { from: 'BOM', to: 'SIN', fromCity: 'Mumbai', toCity: 'Singapore' },
  { from: 'DEL', to: 'LHR', fromCity: 'New Delhi', toCity: 'London' },
];

const STEPS = [
  {
    icon: Search,
    title: 'Search',
    text: 'Compare fares across airlines with times shown in each airport’s local time.',
  },
  {
    icon: Armchair,
    title: 'Pick your seat',
    text: 'Choose exactly where you sit. We hold your seats for 10 minutes while you finish.',
  },
  {
    icon: CreditCard,
    title: 'Pay & go',
    text: 'Confirm in one step and get your e-ticket instantly.',
  },
];

/** Decorative dotted flight path for the hero. */
function FlightPath() {
  return (
    <svg
      viewBox="0 0 600 200"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-full w-full opacity-40"
      aria-hidden
      preserveAspectRatio="none"
    >
      <path
        d="M-20 180 C 150 40, 380 20, 620 90"
        fill="none"
        stroke="#F2884B"
        strokeWidth="2"
        strokeDasharray="2 9"
        strokeLinecap="round"
      />
      <path
        d="M-20 200 C 200 120, 420 150, 620 40"
        fill="none"
        stroke="#C4D0E6"
        strokeWidth="1.5"
        strokeDasharray="2 10"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export function HomePage() {
  const tomorrow = todayIso(1);
  return (
    <>
      <section className="relative overflow-hidden bg-navy-900 pb-28 text-white">
        <FlightPath />
        <div className="relative mx-auto max-w-6xl px-4 pt-14 sm:pt-20">
          <p className="font-mono text-xs font-semibold tracking-[0.2em] text-saffron-400 uppercase">
            FlyGo · Book · Fly
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">
            Where to next?
          </h1>
          <p className="mt-3 max-w-xl text-base text-navy-200">
            Find a flight, choose your exact seat, and have your e-ticket in minutes.
          </p>
        </div>
      </section>

      <div className="relative mx-auto -mt-20 max-w-6xl px-4">
        <div className="rounded-card border border-line/70 bg-surface p-4 shadow-lift sm:p-6">
          <SearchForm />
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="popular-heading">
        <div className="mb-5 flex items-end justify-between">
          <h2 id="popular-heading" className="text-xl font-bold">
            Popular routes
          </h2>
          <span className="text-xs text-muted">Fares for tomorrow</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {POPULAR.map((r) => (
            <Link
              key={`${r.from}-${r.to}`}
              to={`/flights?${toSearchParams({ from: r.from, to: r.to, date: tomorrow }).toString()}`}
              className="group flex items-center justify-between rounded-card border border-line/70 bg-surface px-5 py-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div>
                <p className="flex items-center gap-2 font-mono text-sm font-semibold text-navy-900">
                  {r.from} <ArrowRight className="size-3.5 text-saffron-500" aria-hidden /> {r.to}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {r.fromCity} to {r.toCity}
                </p>
              </div>
              <ArrowRight
                className="size-5 text-muted transition group-hover:translate-x-0.5 group-hover:text-navy-900"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-line/70 bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="flex gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-mono text-xs text-muted">0{i + 1}</p>
                <h3 className="font-bold">{title}</h3>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

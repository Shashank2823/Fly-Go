# FlyGo

A production-oriented flight booking platform: NestJS modular monolith + separate worker process, React/Vite SPA, PostgreSQL (source of truth), Redis/BullMQ, MongoDB (ticket snapshots, email history, notifications).

- Design: [docs/phase-1-system-design.md](docs/phase-1-system-design.md)
- How it works (PostgreSQL vs Redis vs MongoDB, caching, where the code lives): [docs/how-it-works.md](docs/how-it-works.md)
- Status: **Phase 7 (end-to-end tests, authorization audit, polish) complete.** Flights are sample data, not live airline inventory.

## Layout

```
apps/api        NestJS — HTTP API (src/main.ts) and worker (src/worker.ts), Prisma schema/migrations/seed
apps/web        React + Vite + TypeScript SPA
apps/e2e        Playwright end-to-end tests (real browser → web → API → worker)
infra/docker    docker-compose (Redis, MongoDB, Mailpit), Postgres bootstrap SQL, Mongo init
scripts         env-init.sh, db-bootstrap.sh
docs            design documents
```

## Prerequisites

- Node.js 24 (`.nvmrc`), npm 11
- Docker Desktop
- The existing PostgreSQL container `empire_db` (PostgreSQL 15, port 5432). FlyGo uses its own `flygo` / `flygo_shadow` databases and `flygo_app` role on that server and never touches other databases.

## First-time setup

```bash
npm install
npm run env:init          # creates .env with random local secrets (never committed)
docker compose -f ~/Desktop/empire_go/database/docker-compose.yml up -d   # existing PostgreSQL
npm run infra:up          # Redis, MongoDB, Mailpit — waits until healthy
npm run db:bootstrap      # creates flygo role + databases (dev, test, e2e), grants Mongo access (idempotent)
npm run db:migrate        # applies Prisma migrations
npm run db:seed           # roles, INR market, airports, airlines, aircraft, ~3 weeks of flights + seats (idempotent, ~25 s)
```

## Running

Run each in its own terminal:

```bash
npm run dev:api           # http://localhost:3000/api/v1  (Swagger: /api/docs)
npm run dev:worker        # BullMQ processors + job schedulers
npm run dev:web           # http://localhost:5173 (proxies /api to :3000)
```

| Service | URL |
|---|---|
| Web app | http://localhost:5173 |
| API | http://localhost:3000/api/v1 |
| API docs (dev only) | http://localhost:3000/api/docs |
| Mailpit inbox | http://localhost:8025 |

## API (v1)

| Endpoint | Access |
|---|---|
| `GET /auth/csrf`, `POST /auth/register`, `POST /auth/login` | public (CSRF token required for POST) |
| `POST /auth/logout`, `GET /auth/me` | signed in |
| `GET /airports?q=`, `GET /flights`, `GET /flights/:id`, `GET /flights/:id/seat-map`, `GET /reference/countries` | public |
| `GET /bookings`, `POST /bookings` (requires `Idempotency-Key`), `GET /bookings/:reference`, `DELETE /bookings/:reference` | signed in, own bookings only |
| `PUT /bookings/:reference/passengers`, `POST /bookings/:reference/checkout` | signed in, own bookings only |
| `POST /bookings/:reference/payments` (requires `Idempotency-Key`, returns 202), `GET /bookings/:reference/payments/:paymentId` | signed in, own bookings only |
| `GET /bookings/:reference/ticket` (inline PDF), `GET /bookings/:reference/ticket/download` | signed in, own bookings only |
| `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` | signed in, own notifications only |
| `GET /health/live`, `GET /health/ready` | public |
| `GET /health/workers` | `queue:inspect` permission (admins) |

`POST /bookings` holds seats atomically for 10 minutes (booking status `PENDING`). Payment is
asynchronous: `POST …/payments` returns 202, and the **worker** submits it to the (mock) gateway,
receives the simulated webhook and confirms the booking. **Run `npm run dev:worker` alongside the
API** — without it payments stay "processing" and abandoned holds are not expired.

After confirmation the worker also generates the PDF e-ticket (stored under `var/tickets/`, snapshot
in MongoDB), sends the confirmation email (open **Mailpit at http://localhost:8025** to read it) and
creates in-app notifications (the bell in the header). Safety-net jobs re-drive any ticket or email
that didn't complete.

The mock gateway succeeds by default. To try the decline path, either use a contact email with
`+decline` in it on the passenger page (e.g. `asha+decline@example.com` — declines just that
booking, like Stripe's decline test cards), or start the worker with
`MOCK_PAYMENT_OUTCOME=fail npm run dev:worker` to decline everything.

Sessions are HttpOnly cookies backed by Redis; every POST/PUT/PATCH/DELETE must send the
`X-CSRF-Token` header obtained from `GET /auth/csrf` (the web app does this automatically).

## Health

- `GET /api/v1/health/live` — process is up
- `GET /api/v1/health/ready` — PostgreSQL, Redis, MongoDB reachable (503 otherwise)
- `GET /api/v1/health/workers` — worker heartbeat (written by a scheduled BullMQ job), queue counts, SMTP — admins only

## Quality checks

```bash
npm run typecheck
npm run lint
npm test                  # unit tests (api + web)
npm run test:int          # integration tests against flygo_test DB + Redis DB 15 (needs infra up)
npm run test:e2e          # Playwright browser tests (needs infra up; see below)
npm run format:check
```

Integration tests never touch development data: they migrate and truncate the `flygo_test`
database and use Redis logical DB 15.

### End-to-end tests (Playwright)

```bash
npx -w @flygo/e2e playwright install chromium   # once
npm run db:bootstrap                            # once — creates the flygo_e2e database
npm run test:e2e
```

`test:e2e` builds the API, then Playwright starts its own API (:3100), worker and web app
(:5180) — different ports from `npm run dev:*`, so both can run at the same time. Everything
points at isolated resources: PostgreSQL `flygo_e2e` (migrated and seeded on the first run,
~30 s), MongoDB `flygo_e2e` and Redis DB 14. Each run starts by deleting the previous run's
customers, bookings and payments there.

| Spec | Covers |
|---|---|
| `booking-journey` | register → search → seat → hold → passengers → pay → confirmation → PDF view/download → notifications → Mailpit email; guests redirected to sign in |
| `payment-decline` | declined payment, seats kept, retry succeeds; double-clicking "Complete payment" creates one payment |
| `hold-expiry` | an expired hold blocks checkout, the sweeper frees the seat and notifies the traveller |
| `seat-race` | two travellers hold the same seat at once — exactly one wins, the other is told |
| `error-boundary` | a page that crashes shows an error screen while the app stays usable |

Failures keep a trace, screenshot and video: `npm run e2e:report -w @flygo/e2e`. Sign-up is
rate-limited to 5 per hour per IP, so the suite registers at most 5 accounts per run (the
counters are reset at the start of each run).

### Access control

`test/integration/access-control.int-spec.ts` checks every signed-in endpoint: anonymous → 401,
another customer → 404 (someone else's booking looks exactly like one that doesn't exist),
unsafe methods without a CSRF token → 403, admin-only endpoints → 403 for customers, and an
`Idempotency-Key` reused by another customer never replays the first customer's response.

## Database workflow

- Change `apps/api/prisma/schema.prisma`, then `npm run db:migrate -- --name <change>`.
- Constraints Prisma cannot express (partial unique indexes, CHECKs) are added by creating the migration with `--create-only` and editing its SQL before applying.
- Production applies migrations with `npm run db:migrate:deploy`.

## Stopping

```bash
npm run infra:down        # stops Redis/Mongo/Mailpit; data stays in named volumes
```

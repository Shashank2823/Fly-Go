# FlyGo

A production-oriented flight booking platform: NestJS modular monolith + separate worker process, React/Vite SPA, PostgreSQL (source of truth), Redis/BullMQ, MongoDB (ticket snapshots, email history, notifications).

- Design: [docs/phase-1-system-design.md](docs/phase-1-system-design.md)
- How it works (PostgreSQL vs Redis vs MongoDB, caching, where the code lives): [docs/how-it-works.md](docs/how-it-works.md)
- Status: **Phase 6 (PDF e-tickets, confirmation emails, in-app notifications) complete.** Flights are sample data, not live airline inventory.

## Layout

```
apps/api        NestJS — HTTP API (src/main.ts) and worker (src/worker.ts), Prisma schema/migrations/seed
apps/web        React + Vite + TypeScript SPA
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
npm run db:bootstrap      # creates flygo role + databases, grants Mongo test-db access (idempotent)
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

The mock gateway always succeeds. To try the decline path, start the worker with
`MOCK_PAYMENT_OUTCOME=fail npm run dev:worker`.

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
npm run format:check
```

Integration tests never touch development data: they migrate and truncate the `flygo_test`
database and use Redis logical DB 15.

## Database workflow

- Change `apps/api/prisma/schema.prisma`, then `npm run db:migrate -- --name <change>`.
- Constraints Prisma cannot express (partial unique indexes, CHECKs) are added by creating the migration with `--create-only` and editing its SQL before applying.
- Production applies migrations with `npm run db:migrate:deploy`.

## Stopping

```bash
npm run infra:down        # stops Redis/Mongo/Mailpit; data stays in named volumes
```

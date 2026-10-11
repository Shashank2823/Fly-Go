# FlyGo — Phase 1: Requirements & System Design

> Status: **APPROVED with revisions (2026-10-11)** — see §22–§23 and the revised §11. Phase 2 in progress.
> Scope of this document: User Portal (v1) with an architecture and schema that already accommodate the Admin Portal (Phase 9).

---

## 0. What I inspected

| Item | Finding | Consequence |
|---|---|---|
| Project folder `fly go/` | Empty, not a git repo | Greenfield. I will `git init` in Phase 2. |
| Existing PostgreSQL | Container `empire_db`, image `postgis/postgis:15-3.3` (PostgreSQL 15.4), host port `5432`, named volume `database_pgdata`, owned by compose project `~/Desktop/empire_go/database`. Database `empire`, superuser `postgres`. **Currently stopped** (exited 3 months ago). | Reuse the *server*, never the `empire` database. Create a separate database `flygo` and a least-privilege role `flygo_app`. Do not touch its compose file, volume or port. (See open question Q1.) |
| Other containers | `db2` (IBM Db2, port 50000, stopped), `welcome-to-docker` | Irrelevant; no conflicts. |
| Host ports | 5000/7000 used by macOS AirPlay (ControlCenter); 3000, 5173, 6379, 27017, 1025, 8025 free | API on `3000`, web on `5173`, Redis `6379`, Mongo `27017`, Mailpit `1025/8025`. |
| Tooling | Node 24.14, npm 11.11, Docker Compose v5.1 | npm workspaces (no pnpm installed). |

PostgreSQL 15 supports everything this design needs (`NULLS NOT DISTINCT`, partial/unique indexes, `SKIP LOCKED`, `gen_random_uuid()`).

---

## 1. Requirements, scope and assumptions

### 1.1 In scope (User Portal v1)
Registration/login/logout; flight search with filters, sorting and pagination; flight details; a seat map driven by data; **server-side seat holds with expiry**; passenger details; checkout with a server-computed price; **mock payment** behind a provider interface; idempotent booking finalisation; confirmation page; PDF ticket view and download; confirmation email (Mailpit); in-app notifications; booking history.

### 1.2 Assumptions (please correct any of these)
1. **One-way, single-segment bookings** in v1. Round trips and multi-leg trips are deferred. (§6.6 explains how the schema extends.)
2. **Market-based pricing by nationality, one currency per market** (v1: India market, INR). There is no FX conversion (§23).
3. 1–9 passengers per booking. Infants (under 2) sit on a lap, so they get no seat. Seats required = adults + children.
4. Hold TTL is **10 minutes** and configurable. The hold is not extended for the mock payment because it settles synchronously.
5. Seed data uses **real airports** (public reference data) but **fictional airlines, flight numbers and schedules**. The UI shows a persistent "Demo data — not live airline inventory" badge.
6. Brand name: "FlyGo" (the Figma designs say "Argo"; see Q2).
7. The payment-method section in the Figma checkout is **static/visual only**. "Complete Payment" always succeeds via the mock provider, but it runs the full asynchronous payment workflow (§11).
8. Desktop and mobile browsers only. A native mobile app would need a token-based auth path (deferred, §8.6).

### 1.3 Explicitly deferred
Admin Portal UI and APIs (schema, roles and permissions are ready now); cancellations and refunds (states reserved); real payments and webhooks (interface and states designed); password reset (tables and flow designed, endpoints not built); round trips; seat-change after hold (cancel and re-hold instead); signed email ticket links (the v1 link requires login); metrics/tracing exporters (hooks only).

### 1.4 Non-functional targets (for local and dev, but designed honestly)
- **Correctness first.** It must be impossible to double-book a seat or confirm a booking twice, and the database enforces this, not only the application.
- p95 for search is under 300 ms on seeded data. Seat-hold latency is dominated by a single short transaction.
- Every asynchronous effect is **at-least-once**, and every handler is idempotent.
- Losing Redis loses sessions and in-flight jobs, but **never** bookings, payments or seat ownership.

---

## 2. Key architectural decisions (summary)

| # | Decision | Chosen | Main alternatives | Key trade-off |
|---|---|---|---|---|
| D1 | Shape | **Modular monolith** (NestJS) + **separate worker process** from the same codebase | Microservices | Simple deploys and transactions. Module boundaries must be policed by convention and lint rules. |
| D2 | ORM | **Prisma**, with `$queryRaw`/`$executeRaw` for locking SQL; hand-edited migration SQL for partial indexes and checks | TypeORM, Drizzle, Kysely | Great DX and types. Prisma cannot express partial unique indexes or CHECK constraints in its schema, so they live in migration SQL (documented, tested). |
| D3 | Seat concurrency | **Single-row ownership in `flight_seats`** + **atomic conditional `UPDATE … RETURNING`** for holds + `SELECT … FOR UPDATE` at confirmation | Redis locks; `SERIALIZABLE` everywhere; separate reservation table | DB-guaranteed, no distributed locks. Contention is per seat row only. |
| D4 | Reservation model | **Booking-as-hold**: a `PENDING` booking *is* the reservation container | Separate `seat_reservations` aggregate | One aggregate means no orphaned reservation↔booking pairs. It needs fewer cross-table invariants. |
| D5 | Auth | **Server-side sessions in Redis**, HttpOnly + SameSite=Lax cookie, CSRF synchronizer token, Argon2id | JWT access + refresh tokens | Instant revocation, no tokens in JS. Redis becomes part of the auth path. |
| D6 | Async | **Transactional outbox in PG → relay → BullMQ** | Publish directly after commit; Kafka | No lost events on crash. Adds about 1 s of latency and one table. |
| D7 | Money | **`BIGINT` minor units + `CHAR(3)` currency**; rates in integer basis points | `NUMERIC(12,2)` | Integer arithmetic only, with explicit rounding rules. |
| D8 | MongoDB | Used for **ticket snapshots, email delivery history, in-app notifications** (your directive) | Keep all of it in PG | Demonstrates polyglot persistence on genuinely document-shaped, non-transactional data. Costs a third datastore to run and back up (§7). |
| D9 | PDF | **PDFKit + `qrcode`**, rendered in the worker, deterministic output | Puppeteer/Chromium, @react-pdf/renderer | Small, fast, no headless browser in the container. Layout is drawn by code, not CSS. |
| D10 | API contract sharing | NestJS **OpenAPI** (`@nestjs/swagger`) → **`openapi-typescript`** types for the frontend | Shared zod package | One source of truth (the backend DTOs). The frontend types are generated, not hand-copied. |
| D11 | Frontend | React + Vite + TS, React Router, **TanStack Query** (server state), **react-hook-form + zod**, **Tailwind CSS** + an in-house component kit | Redux, MUI | Server state lives in the cache, not a global store. The visual design matches Figma without fighting a component library. |
| D12 | Public identifiers | Bookings are addressed by **6-char booking reference** (PNR-style, e.g. `K7QX2M`); internal PKs are UUIDs and never appear in booking/ticket URLs | Expose UUIDs | Readable references. Ownership checks still mandatory (a reference is guessable). |

Each decision is expanded in the relevant section below, covering why it was chosen, the alternatives, the trade-offs, and the impact on real payments and the admin portal.

---

## 3. High-level architecture

```mermaid
flowchart LR
  subgraph Browser
    WEB["React SPA (Vite)<br/>User Portal<br/>(Admin Portal later: /admin route tree)"]
  end

  subgraph AppHost["Node.js (one codebase, two processes)"]
    API["API process<br/>NestJS HTTP · /api/v1"]
    WRK["Worker process<br/>NestJS app context<br/>BullMQ processors + schedulers + outbox relay"]
  end

  subgraph Infra["Docker infrastructure"]
    PG[("PostgreSQL 15<br/>(existing server, new DB 'flygo')<br/>SOURCE OF TRUTH")]
    RD[("Redis 7<br/>sessions · BullMQ · cache · rate limits")]
    MG[("MongoDB 7<br/>ticket snapshots · email history · notifications")]
    MP["Mailpit<br/>SMTP :1025 · UI :8025"]
    FS[("Ticket file storage<br/>local volume → S3 later")]
  end

  WEB -- "HTTPS JSON + session cookie" --> API
  API -- "transactions" --> PG
  API -- "sessions / cache / throttling" --> RD
  API -- "read notifications, ticket status" --> MG
  API -- "stream PDF" --> FS

  WRK -- "outbox poll (SKIP LOCKED)" --> PG
  WRK -- "consume / enqueue jobs" --> RD
  WRK -- "snapshots, email log, notifications" --> MG
  WRK -- "write PDF" --> FS
  WRK -- "SMTP" --> MP
```

**Why a separate worker process?** Queue processors must not share the HTTP event loop. A slow PDF render must never delay a seat hold. Scaling, deploying and crashing happen independently. Both processes are built from the same NestJS codebase with different root modules (`AppModule` vs `WorkerModule`), so domain services are reused, not duplicated.

---

## 4. Component-level architecture (backend)

```mermaid
flowchart TB
  subgraph HTTP["API process"]
    direction TB
    MW["Middleware: helmet · CORS · session · correlation-id · pino logger"]
    G["Guards: SessionAuthGuard (global) → PermissionsGuard → CsrfGuard · Throttler"]
    P["Pipes: ValidationPipe (class-validator, whitelist + forbidNonWhitelisted)"]
    I["Interceptors: Idempotency · Serialization · Timing"]
    F["Filter: ProblemDetailsExceptionFilter (RFC 9457)"]
    subgraph Ctl["Controllers (thin)"]
      AuthC[auth] --- FlightC[flights] --- BookC[bookings] --- PayC[checkout/payments] --- TixC[tickets] --- NotC[notifications] --- HealthC[health]
    end
  end

  subgraph Domain["Application / domain services"]
    AuthS[AuthService · PasswordHasher · SessionService]
    FlightS[FlightSearchService · SeatMapService]
    InvS[SeatInventoryService<br/>hold / release / confirm SQL]
    BookS[BookingService · BookingStateMachine]
    PriceS[PricingService]
    PayS[PaymentService · PaymentProvider port]
    TixS[TicketService · TicketRenderer port · FileStorage port]
    NotS[NotificationService]
    MailS[EmailService · EmailTransport port]
    AudS[AuditService]
    OutS[OutboxService]
    IdemS[IdempotencyService]
  end

  subgraph Data["Repositories"]
    PGR["Prisma repositories<br/>(users, flights, seats, bookings, payments, tickets, outbox, audit, idempotency)"]
    MGR["Mongo repositories<br/>(ticket_snapshots, email_messages, notifications)"]
  end

  subgraph Async["Worker process"]
    Relay[OutboxRelay]
    QP["Queue producers (typed)"]
    Proc["Processors: tickets · email · notifications · maintenance"]
    Sch["JobSchedulers: expire-holds · outbox-relay · reconcile · cleanup"]
  end

  Ctl --> Domain --> Data
  BookS --> InvS & PriceS & OutS & AudS
  PayS --> BookS
  Relay --> QP --> Proc --> Domain
  Sch --> Proc
```

### Layering rules (enforced with `eslint-plugin-boundaries` / import rules)
1. Controllers call **one** application service method and map DTOs. They contain no business logic.
2. Services own business rules and transaction boundaries. They depend on repository interfaces and ports, never on `PrismaClient` directly, **except** through an injected `TransactionRunner` (see §9.1).
3. Repositories are the only code that touches Prisma or the Mongo driver.
4. Processors are thin. They deserialize the job, call a service, and classify errors as retryable or permanent.
5. Ports (interfaces) define external integrations: `PaymentProvider`, `EmailTransport`, `TicketRenderer`, `FileStorage`, `Clock`, `IdGenerator`. Implementations are bound in module providers by config.
6. Cross-module access goes through the other module's **exported service**, never its repository.
7. Entities (Prisma types) never leave the repository and service layer as HTTP responses. Response DTOs are built by mappers.

---

## 5. Repository and folder structure

```
fly-go/
├── package.json                    # npm workspaces: apps/*, packages/*
├── .env.example                    # placeholders only
├── infra/
│   └── docker/
│       ├── docker-compose.yml      # redis, mongo, mailpit (+ optional postgres profile)
│       └── postgres/
│           └── 001-create-flygo-db.sql   # idempotent: CREATE ROLE flygo_app / DATABASE flygo
├── docs/
│   ├── phase-1-system-design.md    # this file
│   ├── adr/                        # one ADR per decision D1–D12
│   └── runbook.md
├── apps/
│   ├── api/                        # NestJS (both processes)
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/         # includes hand-written SQL for partial indexes/CHECKs
│   │   │   └── seed/               # airports.ts, airlines.ts, aircraft.ts, flights.ts, index.ts
│   │   ├── src/
│   │   │   ├── main.ts             # HTTP bootstrap
│   │   │   ├── worker.ts           # worker bootstrap (createApplicationContext)
│   │   │   ├── app.module.ts
│   │   │   ├── worker.module.ts
│   │   │   ├── config/             # zod env schema, typed ConfigService
│   │   │   ├── common/             # errors, filters, guards, decorators, pagination, money, clock
│   │   │   ├── database/           # PrismaService, TransactionRunner, MongoModule
│   │   │   ├── modules/
│   │   │   │   ├── auth/           # controller, service, session, csrf, guards, dto/
│   │   │   │   ├── users/
│   │   │   │   ├── airports/
│   │   │   │   ├── aircraft/       # aircraft types, layouts
│   │   │   │   ├── flights/        # search, details, fares
│   │   │   │   ├── seat-inventory/ # seat map + hold/release/confirm SQL
│   │   │   │   ├── bookings/       # aggregate, state machine, passengers
│   │   │   │   ├── pricing/
│   │   │   │   ├── payments/       # PaymentService, providers/mock.provider.ts, provider.port.ts
│   │   │   │   ├── tickets/        # service, renderer (pdfkit), storage port, controller
│   │   │   │   ├── notifications/  # in-app (Mongo)
│   │   │   │   ├── email/          # templates, transport port, smtp transport
│   │   │   │   ├── outbox/
│   │   │   │   ├── idempotency/
│   │   │   │   ├── audit/
│   │   │   │   ├── health/
│   │   │   │   └── admin/          # reserved; empty module + permission constants
│   │   │   └── queues/
│   │   │       ├── queue-names.ts
│   │   │       ├── job-types.ts    # typed payloads (versioned)
│   │   │       ├── producers/
│   │   │       ├── processors/
│   │   │       ├── schedulers/
│   │   │       └── batches/        # reconcile-holds, bulk ticket regen (later)
│   │   └── test/
│   │       ├── unit/ · integration/ (Testcontainers) · fixtures/
│   └── web/                        # React + Vite
│       └── src/
│           ├── app/                # router, providers (QueryClient, Auth)
│           ├── api/                # fetch client, generated openapi types, query hooks
│           ├── components/         # ui/ (Button, Input, Card, Badge…), flight/, seat-map/, ticket/
│           ├── features/           # auth, search, booking-flow, bookings, notifications
│           ├── layouts/            # PublicLayout, AppLayout (header/footer per Figma)
│           ├── pages/
│           ├── hooks/ · lib/ · types/
│           └── styles/
├── packages/
│   └── eslint-config/
└── e2e/                            # Playwright
```

The admin portal will be a separate route tree (`/admin/*`) in `apps/web`, lazily loaded and permission-gated. It could also become a separate `apps/admin` later. Either way it calls `/api/v1/admin/*`, which reuses the same domain services.

---

## 6. PostgreSQL data model

### 6.1 ER diagram

```mermaid
erDiagram
  users ||--o{ user_roles : has
  roles ||--o{ user_roles : grants
  users ||--o{ bookings : owns
  users ||--o{ password_reset_tokens : "requests (future)"

  airlines ||--o{ aircraft : operates
  aircraft_types ||--o{ seat_layouts : "has versions"
  seat_layouts ||--o{ layout_cabins : contains
  seat_layouts ||--o{ layout_seats : defines
  aircraft_types ||--o{ aircraft : "instances of"
  seat_layouts ||--o{ aircraft : "currently fitted"

  airports ||--o{ flights : "origin"
  airports ||--o{ flights : "destination"
  airlines ||--o{ flights : markets
  aircraft ||--o{ flights : "flown by"
  seat_layouts ||--o{ flights : "inventory built from"

  flights ||--o{ flight_fares : prices
  flights ||--o{ flight_seats : inventory
  layout_seats ||--o{ flight_seats : "instantiated as"

  flights ||--o{ bookings : for
  bookings ||--o{ booking_passengers : includes
  bookings ||--o{ booking_seats : assigns
  booking_passengers ||--o| booking_seats : "sits in"
  flight_seats ||--o{ booking_seats : "assigned (history)"
  flight_seats }o--o| bookings : "currently held/booked by"
  bookings ||--o{ booking_price_lines : "priced as"
  bookings ||--o{ payments : "paid by attempts"
  bookings ||--o{ tickets : "issued (versions)"

  outbox_events }o..|| bookings : "about (aggregate)"
  audit_logs }o..o| users : "actor"
  idempotency_keys }o--|| users : "scoped to"

  users {
    uuid id PK
    citext email UK
    text password_hash
    text full_name
    text phone
    user_status status
    int session_version
    timestamptz created_at
    timestamptz updated_at
  }
  roles {
    smallint id PK
    text code UK "USER, ADMIN, SUPPORT"
  }
  user_roles {
    uuid user_id PK,FK
    smallint role_id PK,FK
    timestamptz granted_at
    uuid granted_by FK
  }
  airports {
    uuid id PK
    char3 iata_code UK
    text name
    text city
    char2 country_code
    text timezone "IANA e.g. America/New_York"
  }
  airlines {
    uuid id PK
    char2 iata_code UK
    text name
  }
  aircraft_types {
    uuid id PK
    text manufacturer
    text model "A320-200"
  }
  seat_layouts {
    uuid id PK
    uuid aircraft_type_id FK
    int version
    text name
  }
  layout_cabins {
    uuid id PK
    uuid seat_layout_id FK
    cabin_class cabin
    int first_row
    int last_row
    text column_pattern "ABC_DEF  (_ = aisle)"
  }
  layout_seats {
    uuid id PK
    uuid seat_layout_id FK
    int row_number
    char1 column_letter
    cabin_class cabin
    seat_kind kind "STANDARD, EXTRA_LEGROOM, EXIT_ROW"
    text_array features "WINDOW, AISLE"
  }
  aircraft {
    uuid id PK
    uuid airline_id FK
    uuid aircraft_type_id FK
    uuid seat_layout_id FK
    text registration UK
  }
  flights {
    uuid id PK
    uuid airline_id FK
    text flight_number
    uuid origin_airport_id FK
    uuid destination_airport_id FK
    uuid aircraft_id FK
    uuid seat_layout_id FK
    timestamptz departure_at
    timestamptz arrival_at
    flight_status status
    char3 currency
  }
  flight_fares {
    uuid id PK
    uuid flight_id FK
    cabin_class cabin
    bigint base_fare_minor
    char3 currency
  }
  flight_seats {
    uuid id PK
    uuid flight_id FK
    uuid layout_seat_id FK
    text seat_label "12A"
    cabin_class cabin
    seat_inv_status status
    uuid booking_id FK "nullable"
    timestamptz hold_expires_at
    bigint seat_surcharge_minor
    int version
  }
  bookings {
    uuid id PK
    char6 reference UK
    uuid user_id FK
    uuid flight_id FK
    booking_status status
    int seats_required
    timestamptz hold_expires_at
    text contact_email
    text contact_phone
    bigint total_minor "null until priced"
    char3 currency
    int price_version
    timestamptz confirmed_at
    timestamptz expired_at
    timestamptz cancelled_at
    int version
  }
  booking_passengers {
    uuid id PK
    uuid booking_id FK
    smallint ordinal
    passenger_type type
    text first_name
    text last_name
    date date_of_birth
    text email
    text phone
  }
  booking_seats {
    uuid id PK
    uuid booking_id FK
    uuid flight_id FK
    uuid flight_seat_id FK
    uuid passenger_id FK
  }
  booking_price_lines {
    uuid id PK
    uuid booking_id FK
    int price_version
    price_line_kind kind "BASE_FARE, SEAT_SURCHARGE, TAX, FEE"
    text code
    text description
    uuid passenger_id FK "nullable"
    bigint amount_minor
  }
  payments {
    uuid id PK
    uuid booking_id FK
    text provider "mock"
    text provider_payment_id
    payment_status status
    bigint amount_minor
    char3 currency
    text idempotency_key
    text failure_code
    jsonb provider_metadata "no secrets/PAN"
    timestamptz succeeded_at
  }
  tickets {
    uuid id PK
    uuid booking_id FK
    int version
    text ticket_number UK
    ticket_status status
    text snapshot_ref "Mongo _id"
    text storage_key
    char64 sha256
    int attempts
    text last_error
    timestamptz issued_at
  }
  outbox_events {
    uuid id PK
    text aggregate_type
    uuid aggregate_id
    text event_type
    int event_version
    jsonb payload
    outbox_status status
    int attempts
    timestamptz available_at
    timestamptz published_at
  }
  audit_logs {
    bigint id PK
    uuid actor_user_id FK "null = system"
    text actor_type "USER, SYSTEM, ADMIN"
    text action "BOOKING_CONFIRMED…"
    text entity_type
    uuid entity_id
    jsonb before
    jsonb after
    text correlation_id
    timestamptz created_at
  }
  idempotency_keys {
    uuid id PK
    uuid user_id FK
    text scope "POST /bookings/:ref/payments"
    text key
    char64 request_hash
    idem_status status
    int response_status
    jsonb response_body
    timestamptz locked_until
    timestamptz expires_at
  }
  password_reset_tokens {
    uuid id PK
    uuid user_id FK
    char64 token_hash UK
    timestamptz expires_at
    timestamptz used_at
  }
```

All tables have `created_at`/`updated_at timestamptz NOT NULL DEFAULT now()`. I omitted them above where space was tight.

### 6.2 Why this shape (deviations from the proposed entity list)

| Proposed | Decision | Reason |
|---|---|---|
| `aircraft_seat_layouts` | Split into `aircraft_types` → **versioned** `seat_layouts` → `layout_cabins` + `layout_seats` | A layout belongs to an aircraft *type/configuration*. Versioning means reconfiguring a cabin later never mutates inventory of already-scheduled flights. |
| `flight_seats` | Kept. It is **the** seat inventory and the single owner record (`booking_id`) | Ownership in one row makes double-booking structurally impossible (§9). |
| `seat_reservations` | **Folded into `bookings` (`PENDING` + `hold_expires_at`) and `flight_seats` (`HELD`)** | A separate reservation aggregate creates two lifecycles that must agree (reservation expired but booking pending, and so on). Booking-as-hold has one lifecycle. |
| `booking_seats` | Kept as the **passenger ↔ seat assignment** within a booking (historical record) | Current ownership is answered by `flight_seats.booking_id`. `booking_seats` answers "who sits where" and stays as history after expiry. |
| `booking_price_lines` | **Added** | The checkout page needs an itemised breakdown, and the payment amount must be the sum of a frozen server-side quote. |
| `notifications` | **MongoDB** (your directive), not PG | See §7. Notifications are derived from PG events, carry no transactional invariants, and are idempotent by `dedupeKey`. |
| `idempotency_keys` | **Added** | Generic, DB-backed request deduplication for `POST /bookings` and `POST …/payments`. |
| `password_reset_tokens` | **Added now, used later** | Lets password reset be added later without a schema refactor. |

### 6.3 Enums (PostgreSQL native enums; adding values is cheap with `ALTER TYPE … ADD VALUE`)

```
cabin_class      : ECONOMY | PREMIUM_ECONOMY | BUSINESS | FIRST
seat_kind        : STANDARD | EXTRA_LEGROOM | EXIT_ROW
flight_status    : SCHEDULED | DELAYED | DEPARTED | ARRIVED | CANCELLED
seat_inv_status  : AVAILABLE | HELD | BOOKED | BLOCKED
booking_status   : PENDING | PAYMENT_PENDING | CONFIRMED | EXPIRED | CANCELLED | (future) REFUND_PENDING, REFUNDED
passenger_type   : ADULT | CHILD | INFANT
price_line_kind  : BASE_FARE | SEAT_SURCHARGE | TAX | FEE | DISCOUNT
payment_status   : INITIATED | PROCESSING | SUCCEEDED | FAILED | CANCELLED | (future) REQUIRES_ACTION, REFUNDED, PARTIALLY_REFUNDED
ticket_status    : PENDING | GENERATING | ISSUED | FAILED | VOIDED
outbox_status    : PENDING | PUBLISHED | DEAD
user_status      : ACTIVE | LOCKED | DISABLED
idem_status      : IN_PROGRESS | COMPLETED
```
Removing or renaming an enum value is painful in PostgreSQL. That is why the future values are listed now, and why statuses expected to churn heavily (e.g. a future admin "operational flag") would be lookup tables instead.

### 6.4 Constraints enforced by PostgreSQL (not just application code)

| Invariant | Constraint |
|---|---|
| One inventory row per seat per flight | `UNIQUE (flight_id, seat_label)`, `UNIQUE (flight_id, layout_seat_id)` |
| **A seat cannot be owned by two bookings** | Structural: one row, one `booking_id` column |
| Seat status ↔ owner consistency | `CHECK ((status IN ('AVAILABLE','BLOCKED') AND booking_id IS NULL AND hold_expires_at IS NULL) OR (status = 'HELD' AND booking_id IS NOT NULL AND hold_expires_at IS NOT NULL) OR (status = 'BOOKED' AND booking_id IS NOT NULL AND hold_expires_at IS NULL))` |
| Seat assignment refers to a seat **on the booking's flight** | Composite FKs: `booking_seats (flight_seat_id, flight_id) → flight_seats (id, flight_id)` and `booking_seats (booking_id, flight_id) → bookings (id, flight_id)` (with matching `UNIQUE (id, flight_id)` on both parents) |
| A passenger gets at most one seat; a seat appears once per booking | `UNIQUE (booking_id, passenger_id)`, `UNIQUE (booking_id, flight_seat_id)` |
| **At most one successful payment per booking** | `CREATE UNIQUE INDEX ux_payments_one_success ON payments(booking_id) WHERE status = 'SUCCEEDED'` |
| **At most one in-flight payment attempt per booking** | `CREATE UNIQUE INDEX ux_payments_one_inflight ON payments(booking_id) WHERE status IN ('INITIATED','PROCESSING')` |
| Payment idempotency | `UNIQUE (booking_id, idempotency_key)` |
| One ticket per booking version; one *issued* ticket per booking | `UNIQUE (booking_id, version)`, `UNIQUE INDEX … ON tickets(booking_id) WHERE status = 'ISSUED'` |
| Booking reference uniqueness | `UNIQUE (reference)` |
| Email uniqueness (case-insensitive) | `email CITEXT UNIQUE` |
| Status-dependent booking columns | `CHECK (status <> 'CONFIRMED' OR (confirmed_at IS NOT NULL AND total_minor IS NOT NULL))`, `CHECK (status <> 'PENDING' OR hold_expires_at IS NOT NULL)` |
| Flight sanity | `CHECK (arrival_at > departure_at)`, `CHECK (origin_airport_id <> destination_airport_id)`, `UNIQUE (airline_id, flight_number, departure_at)` |
| Money sanity | `CHECK (amount_minor >= 0)` on fares/payments; `CHECK (currency ~ '^[A-Z]{3}$')` |
| Passenger limits | `CHECK (seats_required BETWEEN 1 AND 9)`, `CHECK (ordinal BETWEEN 1 AND 9)`, `UNIQUE (booking_id, ordinal)` |
| Idempotency key uniqueness | `UNIQUE (user_id, scope, key)` |

The application **also** validates all of these (for good error messages). The database is the backstop for races and bugs.

### 6.5 Indexes

| Purpose | Index |
|---|---|
| Flight search | `flights (origin_airport_id, destination_airport_id, departure_at) WHERE status IN ('SCHEDULED','DELAYED')` |
| Airport lookup / autocomplete | `airports (iata_code)` unique; `airports USING gin (city gin_trgm_ops, name gin_trgm_ops)` (pg_trgm) |
| Seat map & availability counts | `flight_seats (flight_id, cabin, status)` |
| Expired-hold sweep | `flight_seats (hold_expires_at) WHERE status = 'HELD'`, `bookings (hold_expires_at) WHERE status = 'PENDING'` |
| My bookings | `bookings (user_id, created_at DESC)` |
| Booking lookup by reference | unique `bookings (reference)` |
| Payments by booking / provider callback | `payments (booking_id)`, `UNIQUE (provider, provider_payment_id)` |
| Outbox relay | `outbox_events (available_at) WHERE status = 'PENDING'` |
| Audit by entity | `audit_logs (entity_type, entity_id, created_at)` |
| Idempotency cleanup | `idempotency_keys (expires_at)` |

### 6.6 Time, money, IDs, retention
- **Time:** every instant is `timestamptz` (UTC). `airports.timezone` is IANA. The API returns `{ utc, local, timezone }` for departure and arrival, and the frontend displays the airport-local time. A "departure date" search filter is interpreted **in the origin airport's timezone** and converted to a UTC range on the server.
- **Money:** `bigint` minor units plus `char(3)` currency. Taxes are stored as integer basis points (e.g. 750 = 7.50%). Rounding is **half-up per price line per passenger**, and the total is the sum of the lines, so it always matches the itemised receipt.
- **IDs:** UUIDv7 generated in the application (time-ordered, index friendly; PG 15 has no native v7). The booking `reference` is 6 characters from an unambiguous alphabet (no 0/O/1/I), which gives about 1 billion combinations, plus retry-on-collision.
- **Retention:** bookings, payments, tickets and audit logs are **never hard-deleted** (FKs use `ON DELETE RESTRICT`). Users are soft-deleted or anonymised (PII scrubbed, rows kept for financial records). Expired `PENDING` bookings keep their passenger rows for 30 days, then a maintenance batch nulls the PII. `idempotency_keys` are purged after 24 h, and `PUBLISHED` outbox rows after 7 days.
- **Round trips later:** `bookings.flight_id` becomes `booking_segments(booking_id, flight_id, ordinal)`. `booking_seats.flight_id` already exists, so seat logic is unaffected.

### 6.7 Seed data
- About 25 real airports with IANA timezones.
- 3 fictional airlines (e.g. "Northwind Air" `NW`).
- 2 aircraft types:
  - A320 with a 3-3 layout: J rows 1–3 in 2-2, Y rows 4–30.
  - B787 with a 2-2-2 / 3-3-3 layout.
- About 60 aircraft.
- About 2,000 flights over the next 60 days on about 40 routes.
- Fares per cabin.
- `flight_seats` generated from the layouts (about 350k rows; trivial for PG).

The seed script is idempotent (upserts on natural keys).

---

## 7. Polyglot persistence — the source of truth for every entity

| Entity / data | Authoritative store | Other copies | Consistency rule |
|---|---|---|---|
| Users, roles, password hashes | **PG** | Redis session holds only `userId`, `sessionVersion` | Roles are re-read from PG on each request (cached 60 s in-process), so revocation applies quickly |
| Airports, airlines, aircraft, layouts, flights, fares | **PG** | Redis: search-result cache (TTL 30 s), airport list (TTL 1 h) | Cache is informational; never used for holds or pricing |
| Seat inventory & ownership | **PG** `flight_seats` | None (the seat map is read live; it's a cheap indexed query) | Only `SeatInventoryService` SQL mutates it |
| Bookings, passengers, seat assignments, price lines | **PG** | Mongo ticket snapshot (immutable, denormalised copy *as printed*) | Snapshot is a historical document, never read back for business decisions |
| Payments | **PG** | none | — |
| Ticket *status & metadata* | **PG** `tickets` | — | PG decides "is there a valid ticket" |
| Ticket *content snapshot* | **Mongo** `ticket_snapshots` | PDF file in storage (derivable) | Keyed by `(bookingId, version)`. Upsert is idempotent. A PDF can be re-rendered from the snapshot |
| Email messages & delivery attempts | **Mongo** `email_messages` | — | Created by worker after the PG event; `dedupeKey` unique index; status machine lives here |
| In-app notifications (+ read state) | **Mongo** `notifications` | — | Created by worker from PG events; `dedupeKey` unique; queries always filtered by `userId` |
| Domain events to process | **PG** `outbox_events` | BullMQ jobs (transient) | Outbox is durable; jobs can be lost and re-derived (§10.5) |
| Audit trail of business transitions | **PG** `audit_logs` (same txn as the change) | — | — |
| Sessions, rate-limit counters, job queues | **Redis** | — | Losing them is an availability incident, not a data-loss incident |

### Why MongoDB is justified for these three (and not for anything transactional)
- **Ticket snapshots:** a self-contained, immutable document capturing exactly what was printed. Its shape will evolve (new fields, branding, multiple legs) without migrations, and it is read by key. It is never joined.
- **Email history:** naturally a document with a growing `attempts[]` array (provider response, SMTP code, timing), rendered subject/HTML hashes, and template version. It's useful for diagnostics with ad-hoc queries.
- **Notifications:** an append-heavy, per-user feed with a flexible `data` payload per type and TTL-based cleanup (Mongo TTL index, e.g. 180 days).

**Costs we accept (and document in the runbook):** a third service to operate, back up (`mongodump`/snapshots), and health-check. There are no cross-store transactions, so every Mongo write happens **after** the PG commit, in a worker, as an idempotent upsert keyed by a deterministic `dedupeKey` (e.g. `booking:K7QX2M:confirmation-email:v1`). If Mongo is down, jobs retry. Bookings are unaffected.

**Deviation from your original spec, flagged:** the original spec put notification records in PostgreSQL. Following your later direction they live in Mongo. The PG `outbox_events` row remains the durable proof that a notification *should* exist, so nothing is lost if a Mongo write fails.

Mongo uses the **official `mongodb` driver** with typed repositories, not Mongoose. Collections are few and simple, and validation happens at the service boundary and in Mongo `$jsonSchema` validators.

---

## 8. Authentication and authorization

### 8.1 Decision: server-side sessions (Redis) + HttpOnly cookie

| | Sessions (chosen) | JWT access + refresh |
|---|---|---|
| Revocation (logout, ban, role removed) | Immediate (delete the session) | Waits for access-token expiry, or needs a denylist (which is a session store anyway) |
| XSS exposure | Cookie is HttpOnly, so it's unreadable from JS | Tokens are often in JS memory or storage; refresh rotation needs care |
| CSRF | Needs protection (SameSite + token) | None if using an Authorization header |
| Infra | Redis on the auth path | Stateless verification |
| Mobile/3rd-party clients | Awkward | Natural |

The only client is a first-party browser SPA on the same site, Redis is already required, and admin actions need instant revocation. Sessions win. If a mobile app arrives, add a separate OAuth2/PKCE token endpoint for that client, without mixing the two mechanisms on the same routes.

### 8.2 Mechanics
- `express-session` + `connect-redis`. Cookie `fg_sid`: `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Path=/`. Idle timeout 30 min (rolling), absolute lifetime 7 days (stored `createdAt` checked on each request).
- **Session fixation:** `session.regenerate()` on login and on privilege change.
- Session payload: `{ userId, sessionVersion, createdAt, csrfSecret }`. **No roles and no PII.** `users.session_version` is incremented on password change or "log out everywhere", which invalidates every session at its next request.
- **Passwords:** Argon2id (`argon2` package), with m=19 MiB, t=2, p=1 (OWASP minimum, tunable through config). Rehash on login when the parameters change. Passwords are 10–128 chars and checked against a small common-password list. Hashing happens **outside** any DB transaction.
- **Login errors:** always `401 INVALID_CREDENTIALS` (no user enumeration). For unknown emails a dummy hash still runs, to equalise timing.
- **Registration:** duplicates rely on the `CITEXT UNIQUE` constraint. A violation is caught and mapped to `409 EMAIL_TAKEN`. (This does enumerate on registration. That's an accepted, standard trade-off; it can be switched to "check your email" when email verification is added.)
- **Rate limiting** (`@nestjs/throttler` with Redis storage):
  - login: 5/min per IP+email and 20/min per IP;
  - register: 5/h per IP;
  - seat holds: 10/min per user;
  - payments: 10/min per user;
  - global default: 120/min per IP.
- **CSRF:** a synchronizer token derived from `csrfSecret` is returned by `GET /auth/csrf` and sent by the SPA as the `X-CSRF-Token` header on every non-GET request. In addition, an `Origin`/`Referer` allow-list check is applied, and the API accepts only `application/json` bodies on unsafe methods. This gives defence in depth on top of SameSite=Lax.
- **CORS:** in dev the SPA calls the API **through the Vite proxy** (same origin), so CORS stays closed. In prod: an explicit allow-list, `credentials: true`, no wildcard.

### 8.3 Authorization model
- **Roles** (table): `USER`, `SUPPORT`, `ADMIN`. They are assigned in `user_roles`, never accepted from a request payload. Registration always assigns `USER`. The first admin is created by a CLI seed command.
- **Permissions** (code constants, mapped from roles):
  - `booking:read:own`, `booking:read:any`, `booking:cancel:any`;
  - `ticket:read:own`, `ticket:read:any`;
  - `flight:manage`, `inventory:manage`, `user:read:any`, `audit:read`, `queue:inspect`.

  A role→permission table can be introduced for the admin UI without changing guards.
- **Guards:** global `SessionAuthGuard` (opt out with `@Public()`) → `PermissionsGuard` (`@RequirePermissions(...)`) → controller.
- **Ownership (IDOR protection)** is enforced in the **service/repository query**, not only by a check after loading: `findByReference(ref, { ownerId: user.id })` unless the actor has `booking:read:any`. A missing *or not-owned* resource returns **404**, so existence isn't leaked. The same applies to tickets and notifications (`{ _id, userId }` filter).

### 8.4 Auth flow

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  participant R as Redis
  participant P as PostgreSQL
  B->>A: GET /api/v1/auth/csrf
  A->>R: create anonymous session (csrfSecret)
  A-->>B: Set-Cookie fg_sid · {csrfToken}
  B->>A: POST /auth/login {email,password} + X-CSRF-Token
  A->>A: Throttler (IP+email) · CsrfGuard · ValidationPipe
  A->>P: SELECT user by email
  A->>A: argon2.verify (dummy hash if no user)
  A->>R: session.regenerate() → {userId, sessionVersion}
  A->>P: INSERT audit_logs(USER_LOGGED_IN)
  A-->>B: 200 {user} · Set-Cookie fg_sid (new id)
  B->>A: GET /bookings (cookie)
  A->>R: load session
  A->>P: load user+roles (60s cache) · check status & sessionVersion
  A-->>B: 200
```

### 8.5 Password reset (designed, built later)
`POST /auth/password/forgot` always returns 202. It stores the SHA-256 of a 32-byte random token in `password_reset_tokens` (TTL 30 min, single use) and sends an email via the outbox. `POST /auth/password/reset` verifies the token, sets the new hash, bumps `session_version`, and marks the token used, all in one transaction.

### 8.6 Impact on admin portal and real payments
The admin portal uses the same session and cookie, with `@RequirePermissions` on every `/admin/*` controller class. A regular user can't escalate by changing frontend state because roles are only read from PG. Real payments don't affect auth. Webhooks are `@Public()`, verified by provider signature, and excluded from CSRF.

---

## 9. Seat concurrency and transaction design (the critical part)

### 9.1 Transaction plumbing
A `TransactionRunner` wraps `prisma.$transaction(async tx => …, { isolationLevel: 'ReadCommitted', timeout: 5000, maxWait: 2000 })`. Repositories accept an optional `tx`. We use **READ COMMITTED + explicit row locks / conditional updates**, not SERIALIZABLE. The critical operations are single-statement atomic updates or `FOR UPDATE`-protected read-modify-writes. That gives the same guarantees without serialization-failure retry storms. Lock ordering is always **booking row → flight_seats rows ordered by `id` → payment row**, which prevents deadlocks. Any `40P01`/`40001` is retried up to 3 times with jitter.

### 9.2 Hold seats (create booking)

```sql
-- inside one transaction
INSERT INTO bookings (id, reference, user_id, flight_id, status, seats_required, hold_expires_at, ...)
VALUES ($booking, $ref, $user, $flight, 'PENDING', $n, now() + interval '10 minutes', ...);

UPDATE flight_seats
   SET status = 'HELD', booking_id = $booking, hold_expires_at = now() + interval '10 minutes',
       version = version + 1, updated_at = now()
 WHERE flight_id = $flight
   AND seat_label = ANY($labels)
   AND (status = 'AVAILABLE'
        OR (status = 'HELD' AND hold_expires_at < now()))   -- reclaim stale holds lazily
RETURNING id, seat_label;

-- if returned rows != requested → ROLLBACK, 409 SEATS_UNAVAILABLE {unavailable:[...]}
-- also within txn: check flight is SCHEDULED/DELAYED and departure_at > now() + 1h,
-- user has < 3 PENDING bookings, audit_logs(BOOKING_HELD)
```

**Why it is race-free:** PostgreSQL row-locks each matched row during `UPDATE`. A concurrent transaction targeting the same row blocks. When the first one commits, the second **re-evaluates the `WHERE` clause** against the new row version (EvalPlanQual), finds `status='HELD'` with a future expiry, matches 0 rows, and fails cleanly. There's no check-then-act gap. The availability the frontend saw is irrelevant.

**Why lazy reclaim of stale holds is safe:** a hold whose expiry has passed may be stolen before the sweeper runs. The previous booking still says `PENDING`, but its confirm step re-verifies ownership under lock (§9.3), so it can never confirm a seat it lost. The sweeper later marks it `EXPIRED`.

### 9.3 Confirm (inside payment finalisation)

```sql
SELECT * FROM bookings WHERE id = $b FOR UPDATE;                 -- serialises all writers of this booking
-- if status = 'CONFIRMED' → return existing result (idempotent)
-- if status <> 'PENDING' → BOOKING_NOT_PAYABLE

SELECT id FROM flight_seats
 WHERE id = ANY($seatIds) ORDER BY id FOR UPDATE;              -- deterministic lock order

UPDATE flight_seats SET status='BOOKED', hold_expires_at=NULL, version=version+1
 WHERE id = ANY($seatIds) AND booking_id = $b AND status = 'HELD'
   AND hold_expires_at > now()       -- future real gateway: hold was extended at PAYMENT_PENDING (§11.4)
RETURNING id;
-- rows != seats_required → hold lost → booking EXPIRED + payment needs refund (mock: auto-void)
UPDATE bookings SET status='CONFIRMED', confirmed_at=now(), hold_expires_at=NULL, version=version+1 WHERE id=$b;
UPDATE payments SET status='SUCCEEDED', succeeded_at=now() WHERE id=$p AND status IN ('INITIATED','PROCESSING');
INSERT INTO tickets (booking_id, version, status, ticket_number) VALUES ($b, 1, 'PENDING', $tn);
INSERT INTO outbox_events (... 'BookingConfirmed' ...);
INSERT INTO audit_logs (... 'BOOKING_CONFIRMED' ...), (... 'PAYMENT_SUCCEEDED' ...);
COMMIT;
```

### 9.4 Release
- **User abandons** (`DELETE /bookings/:ref` while PENDING): lock booking → `UPDATE flight_seats SET status='AVAILABLE', booking_id=NULL, hold_expires_at=NULL WHERE booking_id=$b AND status='HELD'` → booking `CANCELLED`.
- **Sweeper** (every 30 s): `SELECT id FROM bookings WHERE status='PENDING' AND hold_expires_at < now() ORDER BY hold_expires_at LIMIT 200 FOR UPDATE SKIP LOCKED`, then the same release per booking → `EXPIRED`, plus outbox `BookingExpired`. It skips bookings that currently have an `INITIATED/PROCESSING` payment (those are handled by payment reconciliation, §11). `SKIP LOCKED` makes multiple worker replicas safe.
- **Seat map reads** treat `HELD AND hold_expires_at < now()` as available. That means the UI is correct even before the sweeper runs.

### 9.5 Failure scenarios

| Scenario | Outcome |
|---|---|
| Two users click the same seat at the same millisecond | One `UPDATE` matches, the other matches 0 → `409 SEATS_UNAVAILABLE`. **Verified by an integration test with 50 parallel requests: exactly 1 winner.** |
| User holds 2 seats; one was taken a moment ago | All-or-nothing: the txn rolls back and neither seat is held. The response lists the unavailable labels, and the UI refreshes the map. |
| API crashes mid-transaction | PG rolls back, so there's no partial hold. |
| Hold expires while the user is on the checkout page | The UI countdown warns the user. Payment is rejected with `409 HOLD_EXPIRED` *before* the provider is called. The user re-selects seats. |
| Hold expires between payment initiation and confirmation (only possible with a real async gateway) | Booking is `EXPIRED`, payment is `SUCCEEDED` → `RefundRequired` outbox event → refund. The future design extends the hold on initiation (`PAYMENT_PENDING`) to make this rare. |
| Sweeper and confirm race on the same booking | Both lock the booking row first. Whichever is second sees the updated status and backs off. |
| Redis down | Holds and confirms still work (PG only). Sessions fail → 503. Queues pause, and the outbox accumulates. |
| A bug writes `BOOKED` without an owner | CHECK constraint rejects it. |

---

## 10. Lifecycles and state machines

Each status is a **separate column with its own owner**. They are never collapsed into one.

### 10.1 Booking

```mermaid
stateDiagram-v2
  [*] --> PENDING: POST /bookings (seats held, API txn)
  PENDING --> EXPIRED: hold_expires_at passed (sweeper txn)
  PENDING --> CANCELLED: user abandons (API txn)
  PENDING --> PAYMENT_PENDING: payment initiated (hold extended)
  PAYMENT_PENDING --> CONFIRMED: provider event succeeded (apply-payment-event job txn)
  PAYMENT_PENDING --> PENDING: payment failed, hold still valid
  PAYMENT_PENDING --> EXPIRED: hold & grace elapsed
  CONFIRMED --> CANCELLED: future cancel/refund (admin/user)
  EXPIRED --> [*]
  CANCELLED --> [*]
```
A **failed payment does not fail the booking**. It stays `PENDING`, so the user can retry with another card while the hold is valid. That's why there's no `FAILED` booking state. The transition table lives in `BookingStateMachine.assertTransition(from, to)` (pure, unit-tested). Every `UPDATE bookings SET status` also includes `WHERE status = $expectedFrom` as a DB-level guard.

### 10.2 Seat inventory (`flight_seats.status`)

```mermaid
stateDiagram-v2
  [*] --> AVAILABLE: inventory generated from layout
  AVAILABLE --> HELD: hold txn
  HELD --> BOOKED: confirm txn
  HELD --> AVAILABLE: release / expiry sweep
  HELD --> HELD: stale hold reclaimed by another booking
  BOOKED --> AVAILABLE: future cancellation
  AVAILABLE --> BLOCKED: admin (crew seat, broken seat)
  BLOCKED --> AVAILABLE: admin
```

### 10.3 Payment attempt

```mermaid
stateDiagram-v2
  [*] --> INITIATED: txn 1 (row created before provider call)
  INITIATED --> PROCESSING: provider accepted, async result pending (real gateway)
  INITIATED --> SUCCEEDED: provider result (txn 2, with booking confirm)
  INITIATED --> FAILED: provider declined / error
  PROCESSING --> SUCCEEDED: webhook / poll
  PROCESSING --> FAILED: webhook / poll
  INITIATED --> CANCELLED: reconciliation (no provider record) / hold lost before charge
  SUCCEEDED --> REFUNDED: future
  FAILED --> [*]
```

### 10.4 Ticket and email

```mermaid
stateDiagram-v2
  state Ticket {
    [*] --> T_PENDING: created in confirm txn
    T_PENDING --> GENERATING: worker claims (conditional update)
    GENERATING --> ISSUED: snapshot + PDF stored + sha256
    GENERATING --> FAILED: retries exhausted
    FAILED --> GENERATING: reconciliation / manual retry
    ISSUED --> VOIDED: future reissue/cancel (new version created)
  }
  state Email {
    [*] --> QUEUED: Mongo upsert by dedupeKey
    QUEUED --> SENDING
    SENDING --> SENT: SMTP accepted (≠ delivered)
    SENDING --> RETRY_SCHEDULED: transient error
    RETRY_SCHEDULED --> SENDING
    SENDING --> FAILED: permanent error or attempts exhausted
    SENT --> DELIVERED: future provider webhook
    SENT --> BOUNCED: future provider webhook
  }
```

### 10.5 Who may transition what

| State | Transition | Component | Atomic with |
|---|---|---|---|
| Booking | → PENDING | `BookingService.createHold` (API) | seat HELD, audit |
| Booking | → CONFIRMED | `CheckoutService.finalize` (API) | seats BOOKED, payment SUCCEEDED, ticket PENDING row, outbox, audit |
| Booking | → EXPIRED | `HoldExpiryJob` (worker) | seats AVAILABLE, outbox, audit |
| Booking | → CANCELLED | `BookingService.abandon` (API) | seats AVAILABLE, audit |
| Payment | → INITIATED | `PaymentService` (API) txn 1 | idempotency key IN_PROGRESS |
| Payment | → SUCCEEDED/FAILED | `PaymentService` (API) txn 2 / webhook handler (future) | booking confirm (if succeeded) |
| Ticket | → GENERATING/ISSUED/FAILED | `TicketGenerationProcessor` (worker) | outbox `TicketIssued` |
| Email | all | `EmailProcessor` (worker), Mongo | — |
| Notification | create / read | worker (create), API (`markRead`) | — |

---

## 11. Checkout, payment and idempotency

> **Revised after review (A4).** Payment is **asynchronous and queue-driven end to end**, exactly as a real gateway would be. The mock provider always succeeds, but it reports success through the same "provider event" (webhook) ingestion path Stripe or Razorpay would use. Integrating a real gateway later means adding a `PaymentProvider` implementation and a webhook controller; the workflow, states, queues and booking domain stay unchanged.

### 11.1 Payment provider port

```ts
interface PaymentProvider {
  readonly name: string;                                   // 'mock' | 'razorpay' | 'stripe'
  createPayment(input: {
    paymentId: string; amountMinor: bigint; currency: string;
    bookingReference: string; idempotencyKey: string;      // forwarded to provider
  }): Promise<{ providerPaymentId: string; status: 'PROCESSING' | 'REQUIRES_ACTION' | 'SUCCEEDED' | 'FAILED';
                clientAction?: unknown }>;                 // e.g. redirect/3DS data for a real gateway
  getPayment(providerPaymentId: string): Promise<ProviderPaymentState>;   // reconciliation
  refund(providerPaymentId: string, amountMinor: bigint, idempotencyKey: string): Promise<RefundResult>;
  verifyAndParseEvent(rawBody: Buffer, headers: Record<string, string>): ProviderEvent; // webhook signature check
}
```

`MockPaymentProvider` (enabled only when `PAYMENTS_PROVIDER=mock`, and it refuses to boot in production) works like this:
- `createPayment` returns `PROCESSING` plus a `providerPaymentId` (`mockpay_…`).
- It then **emits a simulated provider event** (`payment.succeeded`) after a configurable delay (`MOCK_PAYMENT_DELAY_MS`, default 1500 ms). The event is ingested through `PaymentEventIngestionService.ingest()`, the same function the future webhook controller calls.
- The outcome is always success in normal runs. Tests can override `MOCK_PAYMENT_OUTCOME=fail|timeout|duplicate-events|out-of-order` to exercise every branch.

On the UI, the checkout's card/wallet section is **static** (display only, per your Figma). Clicking "Complete Payment" sends no card data.

### 11.2 End-to-end payment workflow

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant A as API
  participant P as PostgreSQL
  participant W as Worker (payments queue)
  participant M as MockProvider
  B->>A: POST /bookings/K7QX2M/checkout
  A->>P: txn: lock booking, validate PENDING + hold valid + passengers complete,<br/>price from market fares + surcharges + fee rules → booking_price_lines, total_minor, price_version
  A-->>B: 200 {lines, total ₹, priceVersion, holdExpiresAt}
  B->>A: POST /bookings/K7QX2M/payments {priceVersion} · Idempotency-Key
  A->>P: txn: idempotency key · lock booking · assert PENDING, hold valid, priceVersion matches ·<br/>INSERT payments(INITIATED, amount = total_minor) · booking → PAYMENT_PENDING ·<br/>extend hold to now()+15 min · outbox PaymentRequested · audit
  A-->>B: 202 {paymentId, status: INITIATED}
  W->>P: outbox relay → payments.submit-payment {paymentId}
  W->>P: claim: payments INITIATED → PROCESSING (conditional UPDATE)
  W->>M: createPayment(idempotencyKey = paymentId)
  M-->>W: PROCESSING, providerPaymentId
  W->>P: store provider_payment_id
  M-)A: simulated provider event payment.succeeded (same path as a webhook)
  A->>P: INSERT payment_events (UNIQUE provider_event_id) — duplicates ignored
  A->>P: outbox PaymentEventReceived
  W->>P: relay → payments.apply-payment-event {paymentEventId}
  W->>P: txn (§9.3): lock booking → seats → payment; payment SUCCEEDED,<br/>seats BOOKED, booking CONFIRMED, ticket PENDING, outbox BookingConfirmed + PaymentSucceeded, audit
  loop every 1.5 s until terminal (max ~60 s, then "still processing" UI)
    B->>A: GET /bookings/K7QX2M/payments/{paymentId}
    A-->>B: {status, bookingStatus}
  end
```

Database transactions and asynchronous steps are deliberately separate. Every arrow into PostgreSQL above is its own short transaction, and **no provider call ever happens while a transaction is open**.

### 11.3 Payment-specific tables (added to §6)

- `payments`: as in §6.1, plus `status` values `INITIATED → PROCESSING → SUCCEEDED | FAILED | CANCELLED` (`REFUNDED` later).
- **`payment_events`** (new): `id`, `provider`, `provider_event_id` (**UNIQUE with provider**), `payment_id` FK, `type` (`payment.succeeded`, `payment.failed`, …), `provider_created_at`, `payload jsonb` (no secrets), `status` (`RECEIVED | APPLIED | IGNORED`), `received_at`, `applied_at`, `ignore_reason`. This is the durable inbox: every provider signal is recorded **before** acting on it, deduplicated by the unique key, and replayable.

### 11.4 Guarantees and how they're achieved

| Requirement | Mechanism |
|---|---|
| Server-side price only | Amount = `bookings.total_minor` from the checkout quote. The client sends only `priceVersion` (mismatch → `409 PRICE_CHANGED`). |
| Can't pay for an expired hold | The payment-initiation txn checks `hold_expires_at > now() + 15 s`. The hold is then extended while `PAYMENT_PENDING`. The confirm txn re-checks seat ownership under lock. |
| No double submit | `Idempotency-Key` replay + partial unique index `ux_payments_one_inflight` (one INITIATED/PROCESSING attempt per booking) + the booking is `PAYMENT_PENDING` (a second initiation returns `409 PAYMENT_IN_PROGRESS` with the existing `paymentId`). |
| No double confirmation | Booking row lock, `WHERE status='PAYMENT_PENDING'` guards, `ux_payments_one_success`. |
| Duplicate provider events | `UNIQUE (provider, provider_event_id)` on `payment_events`. The apply job is a no-op if the payment is already terminal. |
| Out-of-order events | **Forward-only transitions:** `processing` after `succeeded` → `IGNORED (stale)`. `failed` after `succeeded` → `IGNORED` + alert (needs manual review). |
| Provider event never arrives / worker crash | `reconcile-payments` job (every 2 min): for `PROCESSING` payments older than 3 min → `provider.getPayment()` → synthesise a `payment_events` row (`source=RECONCILIATION`) → same apply path. `INITIATED` payments never submitted are re-enqueued. |
| Payment succeeded but hold lost (should be impossible while extended, but defended) | Booking → `EXPIRED`, payment stays `SUCCEEDED`, outbox `RefundRequired` → `payments.refund-payment` job (mock: instant) → payment `REFUNDED`, notification sent. |
| Payment failed | Payment `FAILED`, booking returns to `PENDING` (if the hold is still valid) so the user can retry with a new Idempotency-Key. Otherwise the booking is `EXPIRED`. |
| Abandoned checkouts free seats | The sweeper expires `PENDING` holds. `PAYMENT_PENDING` bookings expire only after reconciliation confirms no successful payment (or after hold + 30 min grace). |

### 11.5 What changes when a real gateway arrives
1. Implement `RazorpayPaymentProvider` / `StripePaymentProvider`.
2. Add `POST /api/v1/payments/webhooks/:provider` (`@Public`, raw body, signature verified, no CSRF). It calls the same `PaymentEventIngestionService.ingest()`.
3. The frontend handles `clientAction` (redirect/3DS/Checkout widget) from the `202` response.

The booking domain, seat inventory, state machines, queues, outbox, tickets and notifications are untouched.

---

## 12. Queues, workers, outbox and scheduled jobs

### 12.1 Outbox relay
- Business txns insert `outbox_events` (`BookingConfirmed`, `BookingExpired`, `TicketIssued`, later `BookingCancelled`, `PasswordResetRequested`). The payload carries IDs and the reference only, with **no PII**.
- The relay runs in the worker every 1 s (a BullMQ Job Scheduler on the `maintenance` queue):
  - `SELECT … FROM outbox_events WHERE status='PENDING' AND available_at <= now() ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED`
  - for each event and each subscribed handler: `queue.add(name, payload, { jobId: \`${event.id}:${handler}\` })`. The BullMQ `jobId` deduplicates re-publishes.
  - `UPDATE … SET status='PUBLISHED', published_at=now()`.
  - On enqueue failure: `attempts+1`, `available_at = now() + backoff`. After 20 attempts the status becomes `DEAD` and is shown on the health endpoint.
- The guarantee is **at-least-once**, and all handlers are idempotent. No email or PDF is generated while a DB transaction is open.

### 12.2 Queues

| Queue | Jobs | Concurrency | Attempts / backoff | Timeout | Idempotency |
|---|---|---|---|---|---|
| `payments` | `submit-payment {paymentId}`, `apply-payment-event {paymentEventId}`, `refund-payment {paymentId}` | 5 | 8, exponential 2 s → ~8 min | 30 s | Conditional claims (`WHERE status = expected`); provider called with `idempotencyKey = paymentId`; events deduped by `UNIQUE (provider, provider_event_id)`; forward-only transitions |
| `tickets` | `generate-ticket {bookingId, ticketVersion}` | 4 | 6, exponential 5 s → ~5 min | 60 s | Conditional claim `UPDATE tickets SET status='GENERATING' WHERE id=$1 AND status IN ('PENDING','FAILED')`; snapshot upsert by `(bookingId, version)`; storage key deterministic; `ISSUED` → no-op |
| `email` | `send-booking-confirmation {bookingId}`, later `send-password-reset` | 5 | 8, exponential 10 s → ~40 min | 30 s | Mongo `email_messages` unique `dedupeKey`; skip if `SENT` |
| `notifications` | `create-notification {type, userId, bookingRef, dedupeKey}` | 10 | 5, exponential 2 s | 10 s | Mongo upsert `$setOnInsert` on unique `dedupeKey` |
| `maintenance` | `outbox-relay` (1 s), `expire-holds` (30 s), `reconcile-payments` (2 min, enqueues into `payments`), `reconcile-tickets` (5 min), `retry-failed-emails` (10 min), `purge-idempotency-keys` / `purge-outbox` (hourly), `scrub-expired-pii` (daily) | 1 | 3 | 120 s | Each job is a SKIP-LOCKED batch; safe to overlap or repeat |

Event → job fan-out:
- `PaymentRequested` → `payments.submit-payment`
- `PaymentEventReceived` → `payments.apply-payment-event`
- `RefundRequired` → `payments.refund-payment`
- `PaymentFailed` → `notifications.create (PAYMENT_FAILED)`
- `BookingConfirmed` → `tickets.generate-ticket`, `email.send-booking-confirmation`, `notifications.create (BOOKING_CONFIRMED)`
- `TicketIssued` → `notifications.create (TICKET_READY)`
- `BookingExpired` → `notifications.create (BOOKING_EXPIRED)`

The email doesn't wait for the ticket. It links to the booking page, which shows the ticket's live status. That way a PDF failure never blocks the confirmation email.

### 12.3 Reliability details
- **Retryable vs permanent errors:** processors throw `PermanentJobError` (validation failure, booking not found, SMTP 5xx recipient rejected). That error is wrapped in BullMQ's `UnrecoverableError` so it isn't retried. Everything else is retried.
- **Exhausted jobs (dead letter):** a `failed` event listener with `attemptsMade >= attempts` writes the terminal state to the authoritative store (PG `tickets.status = FAILED` with `last_error`; Mongo email `FAILED`) and logs at `error`. BullMQ keeps failed jobs (`removeOnFail: { age: 7d }`) for inspection. Reconciliation jobs re-drive `FAILED` tickets and emails after operator fixes.
- **Lost-job recovery:** if Redis loses jobs after the outbox was marked `PUBLISHED`, the `reconcile-tickets` job finds `CONFIRMED` bookings with no `ISSUED` ticket older than 10 min and re-enqueues them. `retry-failed-emails` does the same for confirmed bookings with no `SENT` email record. The authoritative stores (PG/Mongo) drive recovery; Redis is never trusted as durable.
- **Scheduling API:** BullMQ ≥ 5.16 `queue.upsertJobScheduler(id, { every | pattern }, template)`. The exact version is pinned in Phase 2, and I'll confirm the API against that version's docs before use (the older `repeat` option is deprecated).
- **Redis config for BullMQ:** `maxmemory-policy noeviction` (mandatory; eviction silently corrupts queues), AOF `everysec`.
- **Observability:** every job carries `{ correlationId, eventId }` in its data. The logger child includes `queue`, `jobId`, `attempt`. Bull Board is mounted at `/api/v1/admin/queues`, behind the `queue:inspect` permission. Each queue's counts (waiting/active/failed/delayed) and the worker heartbeat (a Redis key with a 30 s TTL, refreshed by the worker) are exposed at `/health/ready`.
- **Graceful shutdown:** on SIGTERM, stop schedulers → `worker.close()` (waits for active jobs up to 30 s) → close Prisma, Mongo and Redis. The API uses `enableShutdownHooks()` and stops accepting connections first.

### 12.4 Post-confirmation flow

```mermaid
sequenceDiagram
  participant API
  participant PG as PostgreSQL
  participant W as Worker
  participant Q as BullMQ/Redis
  participant MG as MongoDB
  participant FS as File storage
  participant SMTP as Mailpit
  API->>PG: txn 2 commit (booking CONFIRMED + outbox BookingConfirmed)
  W->>PG: relay: SELECT … FOR UPDATE SKIP LOCKED
  W->>Q: add tickets/email/notifications jobs (jobId = eventId:handler)
  W->>PG: outbox PUBLISHED
  par ticket
    Q->>W: generate-ticket
    W->>PG: claim ticket (PENDING→GENERATING), read booking
    W->>MG: upsert ticket_snapshots {bookingId, version}
    W->>W: render PDF (pdfkit, deterministic)
    W->>FS: put tickets/K7QX2M/v1.pdf
    W->>PG: txn: ticket ISSUED + sha256 + outbox TicketIssued
  and email
    Q->>W: send-booking-confirmation
    W->>MG: upsert email_messages {dedupeKey} → SENDING
    W->>SMTP: send
    W->>MG: SENT (+attempt log) / RETRY_SCHEDULED
  and notification
    Q->>W: create-notification
    W->>MG: upsert notifications {dedupeKey}
  end
```

### 12.5 Batches (only where they genuinely help)
- **v1:** expire-holds and the reconciliation sweeps (they are batches by nature: bounded `LIMIT` + `SKIP LOCKED` loops).
- **Admin phase:** bulk flight import (CSV → staging table → validated upsert in chunks, with progress in an `import_jobs` table) and bulk ticket regeneration after a template change.

Individual bookings are never batched.

---

## 13. Tickets (PDF) — generation and access

- **Content:** passenger(s), booking reference, ticket number, airline/flight number, origin/destination with airport-local times, date, duration, cabin, seat(s), fare breakdown, payment status, issued timestamp, QR code (encodes reference + ticket number + sha-prefix only, no PII), plus a "Demo — not valid for travel" footer. The visual style follows your Figma boarding-pass card.
- **Determinism:** the PDF is rendered from the Mongo snapshot, with `CreationDate` = `issuedAt` and fixed fonts embedded (e.g. Montserrat/Inter, OFL-licensed). The same snapshot always gives the same bytes and the same sha256, so retries are byte-identical and safe.
- **Storage:** a `FileStorage` port. `LocalFileStorage` (Docker volume / `./var/tickets`) is used in dev, and `S3FileStorage` comes later. The key is `tickets/{bookingRef}/v{version}.pdf`. It isn't a capability URL; files are only served through the API.
- **Access:**
  - `GET /bookings/:ref/ticket` → `Content-Disposition: inline`
  - `GET /bookings/:ref/ticket/download` → `attachment; filename="FlyGo-K7QX2M.pdf"`

  Both require a session plus ownership (or `ticket:read:any`), and both set `Cache-Control: private, no-store`. If the ticket isn't `ISSUED` yet → `409 TICKET_NOT_READY` + `Retry-After: 3`. The confirmation page polls `GET /bookings/:ref` (which includes `ticket.status`) until it's ready.
- **Email link:** `https://app/bookings/K7QX2M` requires login. A signed, expiring direct link is deferred.

---

## 14. API specification (v1)

### 14.1 Conventions
- Base path `/api/v1`. JSON only. All times are ISO-8601 UTC, with local times supplied separately.
- **Errors:** RFC 9457 `application/problem+json`:
  `{ "type": "https://flygo.dev/errors/seats-unavailable", "title": "Seats unavailable", "status": 409, "code": "SEATS_UNAVAILABLE", "detail": "…", "traceId": "…", "errors": [{ "field": "seats[1]", "message": "…" }], "meta": { "unavailable": ["12B"] } }`.
  No stack traces, SQL, or internal messages. Unknown errors → `500 INTERNAL_ERROR` with `traceId`.
- **Lists:** `{ "data": [...], "page": { "page": 1, "pageSize": 20, "totalItems": 134, "totalPages": 7 } }`. `pageSize ≤ 50`. This offset pagination is used for all v1 lists (bounded datasets). Keyset pagination can be added for the admin later.
- **Auth:** "Session" = valid `fg_sid` cookie. All unsafe methods need `X-CSRF-Token`.
- **Idempotency:** `Idempotency-Key` (UUID) is **required** where marked ✱.
- Common statuses: `400` validation · `401` unauthenticated · `403` authenticated but lacks permission (admin routes only) · `404` not found / not owned · `409` state conflict · `422` semantic error · `429` throttled (+`Retry-After`) · `503` dependency down.

### 14.2 Endpoints

| Method & path | Auth | Request | Response | Errors / notes |
|---|---|---|---|---|
| `GET /auth/csrf` | Public | — | `{csrfToken}` | Creates an anonymous session if needed |
| `POST /auth/register` | Public | `{fullName (2–100), email, password (10–128), phone? (E.164)}` | `201 {user}` + logged-in session | `409 EMAIL_TAKEN`, `400`, `429` |
| `POST /auth/login` | Public | `{email, password}` | `200 {user}` | `401 INVALID_CREDENTIALS`, `423 ACCOUNT_LOCKED`, `429` |
| `POST /auth/logout` | Session | — | `204` | Destroys the session, clears the cookie |
| `GET /auth/me` | Session | — | `{id, fullName, email, phone, roles[], permissions[]}` | `401` |
| `GET /airports?q=` | Public | `q` ≥ 2 chars | `[{iata, name, city, country, timezone}]` (≤ 10) | Cached 1 h |
| `GET /flights` | Public | `from` (IATA), `to` (IATA), `date` (YYYY-MM-DD, origin-local), `passengers` (1–9), `cabin?`, `sort` (`price`\|`departure`\|`duration`), `order`, `page`, `pageSize` | List of `FlightSummary {id, airline{code,name}, flightNumber, origin{iata,city,name}, destination{…}, departure{utc,local,timezone}, arrival{…}, durationMinutes, cabin, fromPrice{amountMinor,currency}, seatsAvailable, status}` | `400` (same airports, date in past), results cached 30 s. `seatsAvailable` is informational. |
| `GET /flights/:flightId` | Public | — | `FlightDetail` (+ fares per cabin) | `404` |
| `GET /flights/:flightId/seat-map` | Public | `cabin?` | `{layout: {cabins: [{cabin, firstRow, lastRow, columns: ["A","B","C",null,"D","E","F"]}]}, seats: [{label, row, column, cabin, kind, features[], state: AVAILABLE\|HELD\|BOOKED\|BLOCKED\|HELD_BY_YOU, surcharge}]}` | Reads live from PG, never cached. With a session, your own holds show as `HELD_BY_YOU`. |
| `POST /bookings` ✱ | Session | `{flightId, cabin, passengers: {adults, children, infants}, seats: ["12A","12B"]}` | `201 Booking {reference, status: PENDING, holdExpiresAt, flight, seats[], passengers: [] }` | `409 SEATS_UNAVAILABLE {unavailable}`, `409 TOO_MANY_PENDING_BOOKINGS`, `422 SEAT_COUNT_MISMATCH`, `422 FLIGHT_NOT_BOOKABLE`, `429` |
| `GET /bookings` | Session (own) | `status?`, `page`, `pageSize` | List of `BookingSummary` | — |
| `GET /bookings/:ref` | Session (owner or `booking:read:any`) | — | `BookingDetail {reference, status, holdExpiresAt, flight, passengers[], seats[{passengerOrdinal,label}], price?{lines[], total}, payment?{status, succeededAt}, ticket?{status, version}, confirmedAt}` | `404` |
| `PUT /bookings/:ref/passengers` | Session (owner) | `{contact: {email, phone}, passengers: [{ordinal, type, firstName, lastName, dateOfBirth, seatLabel?}]}` | `200 BookingDetail` | `409 BOOKING_NOT_EDITABLE` (not PENDING), `409 HOLD_EXPIRED`, `422 PASSENGER_COUNT_MISMATCH`, `422 SEAT_NOT_IN_BOOKING`, `422 AGE_TYPE_MISMATCH`. Idempotent by nature (full replace). |
| `POST /bookings/:ref/checkout` | Session (owner) | — | `{priceVersion, lines: [{kind, code, description, passengerOrdinal?, amountMinor}], totalMinor, currency, holdExpiresAt}` | `409 HOLD_EXPIRED`, `422 PASSENGERS_INCOMPLETE`. Idempotent: re-pricing an unchanged booking gives an identical quote. |
| `POST /bookings/:ref/payments` ✱ | Session (owner) | `{priceVersion}` | `202 {paymentId, status: INITIATED, amountMinor, currency, clientAction?}` | `409 HOLD_EXPIRED`, `409 PRICE_CHANGED`, `409 PAYMENT_IN_PROGRESS {paymentId}`, `409 BOOKING_NOT_PAYABLE`, `422 IDEMPOTENCY_KEY_REUSED` |
| `GET /bookings/:ref/payments/:paymentId` | Session (owner) | — | `{paymentId, status, failureCode?, bookingStatus, updatedAt}` | `404`. Polled by the checkout page. |
| `DELETE /bookings/:ref` | Session (owner) | — | `204` | Only while PENDING (releases the hold). `409` otherwise. |
| `GET /bookings/:ref/ticket` | Session (owner / `ticket:read:any`) | — | `application/pdf` inline | `404`, `409 TICKET_NOT_READY` |
| `GET /bookings/:ref/ticket/download` | same | — | `application/pdf` attachment | same |
| `GET /notifications` | Session (own) | `unreadOnly?`, `page`, `pageSize` | List of `{id, type, title, message, bookingReference?, read, createdAt}` + `unreadCount` | — |
| `PATCH /notifications/:id/read` | Session (own) | — | `204` | `404` (not owned) — idempotent |
| `POST /notifications/read-all` | Session (own) | — | `204` | — |
| `GET /health/live`, `/health/ready` | Public (ready details only for `queue:inspect`) | — | Terminus format | `503` if PG/Redis/Mongo down |

**Why I renamed the proposed endpoints:**
- `seat-reservations` endpoints are replaced by `POST/DELETE /bookings` (booking-as-hold, D4).
- `complete-payment` became `POST …/payments`, because each call creates a payment *attempt* resource. That's RESTful, and it maps 1:1 onto future real-gateway semantics.
- `/flights/:id/seats` became `/seat-map`, because it returns layout plus state, not just seats.

**Reserved for admin (not built):** `/api/v1/admin/{flights,airports,aircraft,seat-layouts,fares,inventory,bookings,users,audit-logs,queues}`, all behind `@RequirePermissions`.

---

## 15. Frontend architecture and UX

- **Stack:** React 19, Vite, TypeScript (strict), React Router (data routers, lazy routes), TanStack Query, react-hook-form + zod, Tailwind CSS, `lucide-react` icons, `date-fns-tz` for display. API types are generated from OpenAPI (`npm run api:types`).
- **API client:** a single `fetch` wrapper with `credentials: 'include'`. It attaches the CSRF token, adds `Idempotency-Key` for mutations that need it (generated **once per user intent** and stored in the booking-flow state, so a retry reuses it), and parses problem+json into a typed `ApiError`. A `401` triggers a redirect to `/login?next=…`.
- **Routes:** `/` (landing + search) · `/flights` (results) · `/flights/:id` (details) · `/flights/:id/seats` · `/book/:ref/passengers` · `/book/:ref/checkout` · `/book/:ref/confirmation` · `/bookings` · `/bookings/:ref` · `/bookings/:ref/ticket` · `/notifications` · `/profile` · `/login` · `/register`. Booking-flow routes are protected, and the URL carries the booking reference so a refresh survives.
- **Seat map:** a CSS grid rendered from `layout.cabins[].columns` (with `null` = aisle). Seats are `<button>`s with `aria-pressed` and an `aria-label` like "Seat 12A, window, extra legroom, available, $25". Arrow-key roving focus is supported. The legend distinguishes available, selected, held by others, booked, blocked and cabin class. The map refetches every 15 s and immediately after a `409`.
- **Hold countdown:** shown on the passengers and checkout pages. It's driven by `holdExpiresAt` from the server, adjusted for client clock skew using the response `Date` header.
- **States:** skeletons for search results and the seat map; empty states ("No flights on this date — try ±1 day"); inline field errors; toast for transient errors; full-page error boundary.
- **Design system:** matches your Figma — white surfaces, a blue primary (≈ `#3563E9`), soft cards with 12px radius, Montserrat/Inter typography, the header with logo, nav and avatar, and the three-column footer. Components: `Button`, `Input`, `Select`, `Card`, `Badge`, `Stepper`, `PriceBreakdown`, `FlightCard`, `SeatMap`, `TicketCard`, `Countdown`, `EmptyState`, `Skeleton`.
- **Admin later:** `/admin/*` lazy chunk, guarded by `permissions` from `/auth/me`. That guard only affects UX; the server enforces access.

---

## 16. Security checklist (applies from Phase 2)

- `helmet` (CSP in prod, HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options`). `trust proxy` is configured explicitly.
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`. Body size limit 100 kb.
- Prisma parameterises queries. Raw SQL uses only tagged `$queryRaw` templates (never `$queryRawUnsafe`).
- Ownership-scoped queries, with 404 on not-owned (§8.3). Booking references are not authorization.
- Secrets come only from env, validated at boot (zod), and the app fails fast if they're missing. `.env.example` contains placeholders only.
- Logs: pino with `redact: ['req.headers.cookie', 'req.headers["x-csrf-token"]', '*.password', '*.email', '*.phone', '*.dateOfBirth', 'res.headers["set-cookie"]']`. Bodies aren't logged by default.
- The PG app role `flygo_app` has DML-only privileges on the `flygo` schema. A separate `flygo_migrator` role is used for migrations. (In local dev one role is acceptable; it's documented.)
- Container hygiene: pinned image tags, non-root app containers (when added), `npm audit` in CI, Renovate later.
- Audit log entries for login, logout, registration, booking held/confirmed/expired/cancelled, payment results, and every admin mutation (later).

---

## 17. Observability

pino JSON logs + `nestjs-cls` correlation ID. The ID comes from `X-Request-Id`, or is generated, and is echoed in responses. It is propagated into outbox payloads and job data, so one booking can be traced from HTTP → event → job → email.

- `/health/live`: process only.
- `/health/ready`: PG `SELECT 1`, Redis `PING`, Mongo `ping`, worker heartbeat age, queue failed counts, outbox `DEAD`/oldest-pending age.

Config is validated at boot. Logging goes through a single `AppLogger`, and metrics/tracing get a `Telemetry` facade (no-op now). That makes the later addition of OpenTelemetry and Prometheus a provider swap, not a refactor.

---

## 18. Docker and local infrastructure plan

**PostgreSQL (reuse existing server, isolated DB):**
1. Start the existing container *with its own compose project* so nothing about it changes: `docker compose -f ~/Desktop/empire_go/database/docker-compose.yml up -d`.
2. Run the idempotent bootstrap `infra/docker/postgres/001-create-flygo-db.sql`. It creates role `flygo_app` (password from your env) and database `flygo` owned by it, and enables `citext` and `pg_trgm`. This executes via `docker exec empire_db psql -U postgres`. The `empire` database is never touched.
3. `DATABASE_URL=postgresql://flygo_app:${PW}@localhost:5432/flygo?schema=public`.

There's also an *optional* compose profile `own-postgres` (postgres:16, port **5433**, volume `flygo_pg`) in case you'd rather decouple from the empire project (see Q1).

**New services** (`infra/docker/docker-compose.yml`, project name `flygo`):

| Service | Image | Ports | Volume | Health check | Notes |
|---|---|---|---|---|---|
| redis | `redis:7.4-alpine` | 6379 | `flygo_redis` | `redis-cli ping` | `--appendonly yes --appendfsync everysec --maxmemory-policy noeviction`, `requirepass` from env |
| mongo | `mongo:7.0` | 27017 | `flygo_mongo` | `mongosh --eval "db.adminCommand('ping')"` | Root user from env; app user created by init script |
| mailpit | `axllent/mailpit` (pinned tag) | 1025 (SMTP), 8025 (UI) | `flygo_mailpit` | `/livez` | Catches all mail locally |

The API and worker run on the host (`npm run start:dev`, `npm run worker:dev`) for fast reload. Dockerfiles for them come in Phase 8. `depends_on: condition: service_healthy` is used where relevant, and a `scripts/wait-for-infra.ts` checks readiness before migrations.

---

## 19. Testing strategy

| Layer | Tool | What is tested (business rules, not just 200s) |
|---|---|---|
| Unit | Jest (api), Vitest (web) | Pricing and rounding (tax per line, totals = Σ lines); `BookingStateMachine` legal/illegal transitions; hold-expiry predicate; seat-count vs passenger-type rules (infants); permission policy; mock-provider determinism; idempotency hash/replay logic; booking-reference generator alphabet; timezone date-range conversion (incl. DST days) |
| Integration | Jest + **Testcontainers** (real PG 15, Redis, Mongo) | Every DB constraint in §6.4 (insert violating rows → expect error); **50 concurrent holds on one seat → exactly 1 success**; overlapping multi-seat holds (A: 1A+1B, B: 1B+1C) → no partial holds; lazy reclaim of an expired hold, and the old booking cannot confirm; double payment submit (same key → replay; different keys concurrently → one 409); payment after expiry rejected; crash between txn1/txn2 → reconciliation resolves; outbox → relay → processors end to end; ticket job retried 3× produces 1 snapshot, 1 file, identical sha256; email transient failure then success → one `SENT` record; IDOR: user B gets 404 for user A's booking, ticket and notification |
| E2E | **Playwright** + seeded DB + Mailpit API | The full journey (register → search → seat → passengers → checkout → pay → confirmation → view and download PDF → notification → email in Mailpit); failure paths: hold expiry (hold TTL 5 s via test config), declined card then success, double-click "Complete Payment", two browser contexts racing for one seat |
| Static | ESLint (incl. import boundaries), `tsc --noEmit`, Prettier | — |

A test-only `Clock` provider makes expiry deterministic.

---

## 20. Risks, race conditions and failure modes (pre-implementation review)

| # | Risk | Mitigation |
|---|---|---|
| R1 | Double-booking a seat | Single-row ownership + conditional UPDATE + CHECKs (§9) |
| R2 | Double confirmation / double charge | Booking row lock, `WHERE status=…` guards, partial unique indexes on payments, idempotency keys (§11) |
| R3 | Seat hoarding (bots or users holding many seats) | Max 3 PENDING bookings per user, max 9 seats each, hold rate limit, short TTL |
| R4 | Lost async work on crash | Transactional outbox + reconciliation from authoritative stores |
| R5 | Duplicate emails/notifications from at-least-once delivery | Deterministic `dedupeKey` unique indexes in Mongo; `SENT` check before sending. **Residual:** a crash *after* SMTP accepts but *before* we record `SENT` can produce a duplicate email. This is inherent to SMTP and acceptable. |
| R6 | Stale price between checkout view and payment | `priceVersion` compare → `409 PRICE_CHANGED` |
| R7 | Clock skew (app vs DB) | All expiry comparisons use DB `now()` in SQL, not app time |
| R8 | IDOR on bookings/tickets/notifications | Owner-scoped queries, 404 semantics, integration tests |
| R9 | Redis eviction corrupting queues or sessions | `noeviction`, memory alerting later |
| R10 | Hot flight contention | Locks are per seat row, not per flight. There's no flight-level counter (deliberately not denormalised; availability is a `COUNT` over an indexed range of ≤ ~400 rows). |
| R11 | Enum evolution pain | Future states pre-declared; churn-prone categories as lookup tables |
| R12 | Reusing another project's PG server couples lifecycles | Separate DB and role; option to move to own container (Q1) |
| R13 | PII sprawl | PII only in PG booking tables and the Mongo ticket snapshot. Logs are redacted, outbox payloads hold IDs only, expired bookings are scrubbed after 30 days. |

---

## 21. Implementation roadmap (each phase ends with a demo and your review)

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 2 Setup | git init, npm workspaces, NestJS API + worker bootstraps, Vite app, ESLint/Prettier, env validation, compose (redis/mongo/mailpit), flygo DB bootstrap on existing PG, Prisma init + first migration, health endpoints | `npm run infra:up && npm run db:migrate && npm run dev` works; `/health/ready` is all green |
| 3 Auth + core data | Users, roles, sessions, CSRF, throttling, register/login/logout/me; full schema migration with all constraints; seed; airports and flight search API | Constraint tests and auth tests pass; search returns seeded flights in local times |
| 4 Seats | Seat-map API, hold/release, sweeper, seat-map UI, search UI | 50-way concurrency test passes; expired holds are released |
| 5 Booking + checkout | Passengers, pricing, checkout, mock provider, idempotent payments, reconciliation, confirmation and history pages | All §11.3 guarantees covered by tests |
| 6 Async + tickets | Outbox relay, queues, PDF tickets, Mongo snapshots, emails via Mailpit, in-app notifications, Bull Board | Retries, dedup and recovery tests pass |
| 7 Frontend completion | Remaining screens, polish against Figma, Playwright E2E, README | Full journey E2E is green |
| 8 Production review | Dockerfiles, security review, index/EXPLAIN review, backup notes, limitations list | Written report |
| 9 Admin portal | Admin APIs + UI on the existing services | — |

---

## 22. Review decisions (2026-10-11)

| Q | Decision |
|---|---|
| Q1 PostgreSQL | **Reuse the existing `empire_db` server** with a new `flygo` database, a `flygo_app` role, and a `flygo_shadow` database for Prisma migrations. The `empire` database is never touched. |
| Q2 Brand | **FlyGo** |
| Q3 Hold TTL | **10 minutes** (extended to 15 min while a payment is `PAYMENT_PENDING`) |
| Q4 Payment | **Static checkout UI, always-successful mock**, but the full asynchronous payment workflow runs through queues, the provider-event inbox and reconciliation (§11) |
| Q5 Pricing | **Market-based pricing by nationality, INR only for now** (§23) |

## 23. Market (nationality) based pricing

**Interpretation:** the price a customer sees depends on their **market**, which is derived from the booking user's nationality (`users.nationality`, ISO-3166 alpha-2, collected at registration). Each market has one currency.

- New table **`markets`**: `code` (PK, e.g. `IN`, `INTL`), `name`, `currency CHAR(3)`, `is_default`.
- New table **`market_countries`**: `country_code` (PK) → `market_code`. Unmapped nationalities fall back to the default market.
- **`flight_fares`** becomes `UNIQUE (flight_id, cabin, market_code)` with `base_fare_minor` in that market's currency.
- **`fee_rules`** (new): `market_code`, `code`, `kind` (`PERCENT_OF_BASE_BPS | FIXED_PER_PASSENGER | SEAT_KIND_SURCHARGE`), `seat_kind?`, `value`, `active_from/to`.
- **`flights.currency` is removed.** Currency comes from the market. `bookings.market_code` and `bookings.currency` are frozen when the booking is created, so a later profile change can't alter an in-progress booking's price.
- A booking is priced in **one** market, the booking owner's. Per-passenger nationality is stored on `booking_passengers.nationality` (useful for travel documents later) but doesn't split the price; one booking can't mix currencies.
- **v1 seed:** a single market `IN` (INR), marked default, so every nationality is priced in INR. Adding a USD market later is pure data: one `markets` row, country mappings, fares and fee rules.

**v1 INR fee rules** (your approved numbers, converted and rounded):

| Rule | Value |
|---|---|
| Tax | 7.5% of base fare |
| Booking/convenience fee | ₹450 per passenger |
| Extra-legroom seat surcharge | ₹2,000 |
| Exit-row seat surcharge | ₹1,200 |

**Seed routes** change to mostly Indian domestic flights between about 15 Indian airports (DEL, BOM, BLR, MAA, CCU, HYD, GOI, …), plus some international ones (DXB, SIN, LHR, …). Fares are realistic INR ranges. Airlines and schedules are still fictional.

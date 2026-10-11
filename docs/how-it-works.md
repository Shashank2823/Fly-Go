# How FlyGo works — data stores, caching and where the code lives

> A living guide. Each section has a **plain-language** explanation followed by the
> **technical** detail and links to the exact code. Updated at the end of every phase.
> Current state: **end of Phase 4** (search, seat maps, seat holds).

---

## 1. The big picture

**In plain words.** FlyGo has three places where it keeps data, each with a different job:

| Store | Think of it as… | Holds |
|---|---|---|
| **PostgreSQL** | The official ledger. If it's not here, it didn't happen. | Users, airports, flights, fares, every seat, bookings, payments, audit trail |
| **Redis** | A whiteboard next to the ledger: fast, temporary, wiped without harm. | Short-lived caches, login sessions, rate-limit counters, background job queues |
| **MongoDB** | A filing cabinet for documents (not used by any page yet). | From Phase 6: ticket snapshots, email delivery history, in-app notifications |

The golden rule: **prices, seat availability and bookings are always decided by PostgreSQL**.
Redis may *speed up showing* information, but it never decides anything.

**Technically.**

```mermaid
flowchart LR
  B[Browser · React SPA] -- "/api/v1 (Vite proxy in dev)" --> API[NestJS API]
  API -- "Prisma + SQL (source of truth)" --> PG[(PostgreSQL)]
  API -- "cache · sessions · rate limits" --> RD[(Redis)]
  API -. "connected, health-checked only" .-> MG[(MongoDB)]
  W[Worker process] -- "BullMQ jobs" --> RD
  W -- "expire abandoned holds" --> PG
```

- The browser never talks to a database. Everything goes through the API at `/api/v1/...`.
  In development the Vite dev server forwards `/api` to port 3000 — see the proxy in
  [`apps/web/vite.config.ts`](../apps/web/vite.config.ts#L11).
- Every API call from the frontend goes through one function,
  [`apiRequest()` in `apps/web/src/api/client.ts`](../apps/web/src/api/client.ts#L69).

---

## 2. What you see before signing in — and where it comes from

| Screen element | Source | Store |
|---|---|---|
| Home hero text, "how it works" steps, header, footer | Hard-coded in the frontend | none |
| "Popular routes" cards | Hard-coded list [`POPULAR` in `HomePage.tsx`](../apps/web/src/pages/HomePage.tsx#L7) — each card is just a link that runs a real search | none |
| Airport suggestions (From / To) | `GET /api/v1/airports` | PostgreSQL, cached in Redis for 1 h |
| Flight results | `GET /api/v1/flights?...` | PostgreSQL, cached in Redis for 30 s |
| Fare per adult on the seat page | `GET /api/v1/flights/:id` | PostgreSQL (not cached) |
| Seat map | `GET /api/v1/flights/:id/seat-map` | PostgreSQL (**never** cached). When signed in it also returns `yourHolds` — your own unexpired holds on that flight, so you can resume or release them |
| Country list on the sign-up page | `GET /api/v1/reference/countries` — a static list in [`countries.ts`](../apps/api/src/common/reference/countries.ts#L2) | none (code) |
| "Am I signed in?" check | `GET /api/v1/auth/me` | Redis session → PostgreSQL user (only if a session exists) |

---

## 3. PostgreSQL — the source of truth

**In plain words.** PostgreSQL stores everything that must be correct: which flights exist,
what they cost, which seat belongs to whom. When two people try to grab the same seat at the
same moment, PostgreSQL itself makes sure only one of them gets it.

**Technically.**

- **Connection:** [`PrismaService`](../apps/api/src/database/prisma.service.ts#L11) — Prisma 7
  with the `pg` driver adapter. One shared connection pool per process.
- **Schema:** [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma); extra safety
  rules Prisma can't express (CHECK constraints, partial unique indexes) are in the
  [core migration SQL](../apps/api/prisma/migrations/20261011183639_core_schema/migration.sql).
- **Flight search** — one SQL query joining `flights`, `airlines`, `aircraft`, `flight_fares`
  and a live count of free seats:
  [`FlightsRepository.search()`](../apps/api/src/modules/flights/flights.repository.ts#L54).
  "Free" includes seats whose hold has expired — [`AVAILABLE_SEAT`](../apps/api/src/modules/flights/flights.repository.ts#L39).
- **Price per adult** = base fare from `flight_fares` + rules from `fee_rules` (7.5% tax,
  ₹450 fee), computed by the pure function
  [`calculatePrice()`](../apps/api/src/modules/pricing/price-calculator.ts).
- **Seat map** — [`SeatInventoryRepository.seatMap()`](../apps/api/src/modules/seat-inventory/seat-inventory.repository.ts#L34)
  reads `flight_seats` + `layout_seats` live on every request.
- **Holding seats** — a single atomic SQL update that only succeeds for free seats:
  [`SeatInventoryRepository.hold()`](../apps/api/src/modules/seat-inventory/seat-inventory.repository.ts#L58).
  Explained in depth in the design doc, §9.

> **Small in-memory cache (not Redis):** market and fee-rule *configuration* is kept in the
> API's own memory for 60 seconds —
> [`MarketsService`](../apps/api/src/modules/markets/markets.service.ts#L11). It only stores
> which market a nationality maps to; fares are still read from PostgreSQL.

---

## 4. Redis — how and where it comes into the picture

**In plain words.** Redis is a very fast in-memory store. FlyGo uses it for five things, all
of which are *temporary*. If Redis were wiped, nobody would lose a booking: people would be
signed out, the next search would be a little slower, and background jobs would restart.

All FlyGo keys start with `flygo:` (set once in
[`redis.module.ts`](../apps/api/src/infrastructure/redis/redis.module.ts#L20)), so they never
clash with anything else in Redis.

### 4.1 Caching search results and airports

**Plain:** when someone searches Delhi → Mumbai, the answer is remembered for 30 seconds. If
another person runs the same search within that time, FlyGo answers from Redis instead of
asking PostgreSQL again. The airport list is remembered for an hour because it rarely changes.

**How it works — "cache-aside":**

```mermaid
sequenceDiagram
  participant API as FlightsService
  participant C as CacheService (Redis)
  participant DB as PostgreSQL
  API->>C: wrap(key, 30s, load)
  C->>C: GET flygo:cache:flight-search:<hash>
  alt cache hit
    C-->>API: cached JSON
  else cache miss
    C->>DB: run load() — the real SQL query
    DB-->>C: rows
    C->>C: SET key value EX 30   (fire-and-forget)
    C-->>API: fresh result
  end
```

**Where the code is:**

| What | File |
|---|---|
| The generic cache helper — `wrap()` reads, falls back to the loader, then writes with a TTL | [`cache.service.ts` → `wrap()`](../apps/api/src/infrastructure/cache/cache.service.ts#L24) (read at [line 26](../apps/api/src/infrastructure/cache/cache.service.ts#L26), write at [line 32](../apps/api/src/infrastructure/cache/cache.service.ts#L32)) |
| How cache keys are built (SHA-256 hash of the query, so keys are short and contain no personal data) | [`CacheService.key()`](../apps/api/src/infrastructure/cache/cache.service.ts#L16) |
| Flight search uses it (30 s, key includes the pricing market) | [`flights.service.ts` line 76–78](../apps/api/src/modules/flights/flights.service.ts#L76), TTL constant at [line 15](../apps/api/src/modules/flights/flights.service.ts#L15) |
| Airport list/search uses it (1 h) | [`airports.controller.ts` line 47](../apps/api/src/modules/airports/airports.controller.ts#L47) |

**Safety rules built in:**
- If Redis is down, `wrap()` logs a warning and just queries PostgreSQL — the site keeps working.
- The seat map and seat holds are **never** cached. A cached "seat available" could be wrong,
  so anything that decides who gets a seat always goes straight to PostgreSQL.
- Search results can be up to 30 s old. That's acceptable because the seat map and the hold
  re-check everything live.

### 4.2 Login sessions

**Plain:** when you sign in, the server remembers "this browser belongs to Asha" in Redis.
Your browser only keeps a random ticket number in a cookie (`fg_sid`) that JavaScript can't
read. Signing out deletes the Redis entry, so the ticket stops working instantly.

**Even before signing in**, opening the sign-in page creates a tiny anonymous session holding
only a security token (CSRF token) that protects the sign-in form from forged submissions.

**Where the code is:**

| What | File |
|---|---|
| Session middleware (cookie `fg_sid`, HttpOnly, 30-min idle expiry) | [`session.middleware.ts`](../apps/api/src/modules/auth/session/session.middleware.ts#L12) |
| Our Redis session store — saves (`SET … EX`), refreshes (`EXPIRE`), deletes (`DEL`) `flygo:sess:<id>` | [`redis-session.store.ts`](../apps/api/src/modules/auth/session/redis-session.store.ts#L33) |
| Plugged into every request | [`configure-app.ts` line 18](../apps/api/src/bootstrap/configure-app.ts#L18) |
| CSRF token created and stored in the session | [`auth.controller.ts` → `csrf()`](../apps/api/src/modules/auth/auth.controller.ts#L30) |
| Each request: read session → load the user from PostgreSQL | [`session-auth.guard.ts` → `resolveUser()`](../apps/api/src/modules/auth/guards/session-auth.guard.ts#L35) |
| Frontend fetches the CSRF token automatically | [`client.ts` → `ensureCsrfToken()`](../apps/web/src/api/client.ts#L25) |

The session holds **no personal data** — only a user id, a version number, the sign-in time
and the CSRF token. Roles and names are re-read from PostgreSQL on every request.

### 4.3 Rate limiting

**Plain:** Redis counts how many requests come from each visitor per minute, so nobody can
hammer the login form or grab seats with a bot.

| Limit | Applies to |
|---|---|
| 120 requests / minute per IP | every endpoint (default) — [`rate-limit.ts`](../apps/api/src/modules/auth/rate-limit/rate-limit.ts#L15) |
| 5 / minute per IP + email, 20 / minute per IP | sign-in — [`auth.controller.ts`](../apps/api/src/modules/auth/auth.controller.ts#L50) |
| 5 / hour per IP | sign-up — [`auth.controller.ts`](../apps/api/src/modules/auth/auth.controller.ts#L40) |
| 10 / minute per user | holding seats — [`bookings.controller.ts`](../apps/api/src/modules/bookings/bookings.controller.ts#L45) |

**How:** a counter key `flygo:rl:<rule>:<hashed visitor>:<minute>` is incremented and given an
expiry in one atomic step — [`rate-limiter.service.ts` line 28–29](../apps/api/src/modules/auth/rate-limit/rate-limiter.service.ts#L28).
The guard that applies it to every request is
[`RateLimitGuard`](../apps/api/src/modules/auth/guards/rate-limit.guard.ts#L10), registered
globally in [`auth.module.ts`](../apps/api/src/modules/auth/auth.module.ts#L26).

### 4.4 Background jobs (BullMQ queues)

**Plain:** some work shouldn't happen while you wait — e.g. tidying up abandoned seat holds.
The API (or a timer) drops a "job" into a Redis queue, and the separate **worker** process
picks it up.

| Job | How often | What it does | Code |
|---|---|---|---|
| `worker-heartbeat` | every 10 s | proves the worker is alive (writes `flygo:worker:heartbeat`) | [`maintenance.processor.ts` line 26–28](../apps/api/src/queues/processors/maintenance.processor.ts#L26) |
| `expire-holds` | every 30 s | expires unpaid holds older than 10 min and frees their seats **in PostgreSQL** | [`maintenance.processor.ts` line 31](../apps/api/src/queues/processors/maintenance.processor.ts#L31) → [`hold-expiry.service.ts`](../apps/api/src/modules/seat-inventory/hold-expiry.service.ts) |

- Queue setup (Redis connection, key prefix `flygo:bull`, retries):
  [`queues.module.ts`](../apps/api/src/queues/queues.module.ts#L15)
- Timers are registered by [`maintenance.scheduler.ts`](../apps/api/src/queues/schedulers/maintenance.scheduler.ts#L17)
- Redis only carries the *job*; the *result* (booking expired, seats freed) is written to
  PostgreSQL. Losing a job just means the next run 30 s later does the work.
- Phases 5–6 add queues for payments, tickets, emails and notifications.

### 4.5 Health check

`GET /api/v1/health/ready` pings Redis; the admin-only `/health/workers` reads the worker
heartbeat key — [`health.indicators.ts`](../apps/api/src/modules/health/health.indicators.ts#L74).

### 4.6 Redis keys at a glance

| Key pattern | Purpose | Expires after |
|---|---|---|
| `flygo:cache:flight-search:<hash>` | cached search results | 30 s |
| `flygo:cache:airports:<hash>` | cached airport list / search | 1 h |
| `flygo:sess:<session-id>` | login session (or anonymous CSRF session) | 30 min idle |
| `flygo:rl:<rule>:<hash>:<window>` | rate-limit counters | the rule's window |
| `flygo:worker:heartbeat` | last worker heartbeat | 2 min |
| `flygo:bull:maintenance:*` | BullMQ queue data and job schedules | managed by BullMQ |

**See it yourself** (with infra running; Redis asks for `REDIS_PASSWORD` from `.env` — type
`AUTH <password>` at the prompt):

```bash
docker exec -it flygo-redis-1 redis-cli
```

Then, inside `redis-cli`: `SCAN 0 MATCH flygo:* COUNT 100`, `TTL <key>`, `GET <key>`.
Run a flight search in the browser and a `flygo:cache:flight-search:*` key appears; wait
30 seconds and it disappears.

---

## 5. MongoDB — connected, not used yet

**Plain:** MongoDB is ready and running, but no page reads or writes it yet. From Phase 6 it
will store documents that don't need strict relational rules: a frozen copy of each ticket as
printed, the history of every email sent, and your in-app notifications.

**Technically:** the client connects at start-up in
[`mongo.module.ts`](../apps/api/src/database/mongo.module.ts#L17) and readiness pings it in
[`health.indicators.ts`](../apps/api/src/modules/health/health.indicators.ts#L51). Nothing else
touches it yet.

---

## 6. One search, end to end

1. You press **Search** → the URL becomes `/flights?from=DEL&to=BOM&date=…`.
2. [`useFlightSearch()`](../apps/web/src/api/flights.ts#L79) calls `GET /api/v1/flights?...`.
3. Every request passes the global guards: session lookup in **Redis** → rate-limit counter in
   **Redis** → CSRF check (only for POST/PUT/DELETE) → permission check.
4. [`FlightsService.search()`](../apps/api/src/modules/flights/flights.service.ts) validates the
   airports (**PostgreSQL**), works out the pricing market, and calls the **Redis** cache.
5. On a cache miss, one SQL query in **PostgreSQL** returns the flights, fares and live seat
   counts; prices are calculated; the result is stored in **Redis** for 30 s.
6. The JSON goes back to the browser, which shows each time in the airport's local time.

Clicking **Select seats** then calls the seat-map endpoint, which always reads **PostgreSQL**
directly — no cache — because that screen is about to make a real decision.

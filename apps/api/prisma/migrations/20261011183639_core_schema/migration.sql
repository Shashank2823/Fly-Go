-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "cabin_class" AS ENUM ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST');

-- CreateEnum
CREATE TYPE "seat_kind" AS ENUM ('STANDARD', 'EXTRA_LEGROOM', 'EXIT_ROW');

-- CreateEnum
CREATE TYPE "flight_status" AS ENUM ('SCHEDULED', 'DELAYED', 'DEPARTED', 'ARRIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "seat_inv_status" AS ENUM ('AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "passenger_type" AS ENUM ('ADULT', 'CHILD', 'INFANT');

-- CreateEnum
CREATE TYPE "price_line_kind" AS ENUM ('BASE_FARE', 'SEAT_SURCHARGE', 'TAX', 'FEE', 'DISCOUNT');

-- CreateEnum
CREATE TYPE "fee_rule_kind" AS ENUM ('PERCENT_OF_BASE_BPS', 'FIXED_PER_PASSENGER', 'SEAT_KIND_SURCHARGE');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('INITIATED', 'PROCESSING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "payment_event_source" AS ENUM ('WEBHOOK', 'SIMULATED', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "payment_event_status" AS ENUM ('RECEIVED', 'APPLIED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('PENDING', 'GENERATING', 'ISSUED', 'FAILED', 'VOIDED');

-- CreateEnum
CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'PUBLISHED', 'DEAD');

-- CreateEnum
CREATE TYPE "idem_status" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(20),
    "nationality" CHAR(2) NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "session_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" SMALLINT NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markets" (
    "code" VARCHAR(8) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "market_countries" (
    "country_code" CHAR(2) NOT NULL,
    "market_code" VARCHAR(8) NOT NULL,

    CONSTRAINT "market_countries_pkey" PRIMARY KEY ("country_code")
);

-- CreateTable
CREATE TABLE "fee_rules" (
    "id" UUID NOT NULL,
    "market_code" VARCHAR(8) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "kind" "fee_rule_kind" NOT NULL,
    "seat_kind" "seat_kind",
    "value" BIGINT NOT NULL,
    "active_from" TIMESTAMPTZ(6) NOT NULL,
    "active_to" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fee_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airports" (
    "id" UUID NOT NULL,
    "iata_code" CHAR(3) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airlines" (
    "id" UUID NOT NULL,
    "iata_code" CHAR(2) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "airlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aircraft_types" (
    "id" UUID NOT NULL,
    "manufacturer" VARCHAR(40) NOT NULL,
    "model" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "aircraft_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_layouts" (
    "id" UUID NOT NULL,
    "aircraft_type_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seat_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layout_cabins" (
    "id" UUID NOT NULL,
    "seat_layout_id" UUID NOT NULL,
    "cabin" "cabin_class" NOT NULL,
    "first_row" SMALLINT NOT NULL,
    "last_row" SMALLINT NOT NULL,
    "column_pattern" VARCHAR(16) NOT NULL,

    CONSTRAINT "layout_cabins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layout_seats" (
    "id" UUID NOT NULL,
    "seat_layout_id" UUID NOT NULL,
    "row_number" SMALLINT NOT NULL,
    "column_letter" CHAR(1) NOT NULL,
    "cabin" "cabin_class" NOT NULL,
    "kind" "seat_kind" NOT NULL DEFAULT 'STANDARD',
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "layout_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aircraft" (
    "id" UUID NOT NULL,
    "airline_id" UUID NOT NULL,
    "aircraft_type_id" UUID NOT NULL,
    "seat_layout_id" UUID NOT NULL,
    "registration" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "aircraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flights" (
    "id" UUID NOT NULL,
    "airline_id" UUID NOT NULL,
    "flight_number" VARCHAR(8) NOT NULL,
    "origin_airport_id" UUID NOT NULL,
    "destination_airport_id" UUID NOT NULL,
    "aircraft_id" UUID NOT NULL,
    "seat_layout_id" UUID NOT NULL,
    "departure_at" TIMESTAMPTZ(6) NOT NULL,
    "arrival_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "flight_status" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "flights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_fares" (
    "id" UUID NOT NULL,
    "flight_id" UUID NOT NULL,
    "cabin" "cabin_class" NOT NULL,
    "market_code" VARCHAR(8) NOT NULL,
    "base_fare_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "flight_fares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_seats" (
    "id" UUID NOT NULL,
    "flight_id" UUID NOT NULL,
    "layout_seat_id" UUID NOT NULL,
    "seat_label" VARCHAR(4) NOT NULL,
    "cabin" "cabin_class" NOT NULL,
    "kind" "seat_kind" NOT NULL,
    "status" "seat_inv_status" NOT NULL DEFAULT 'AVAILABLE',
    "booking_id" UUID,
    "hold_expires_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "flight_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "reference" CHAR(6) NOT NULL,
    "user_id" UUID NOT NULL,
    "flight_id" UUID NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'PENDING',
    "cabin" "cabin_class" NOT NULL,
    "market_code" VARCHAR(8) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "adults" SMALLINT NOT NULL,
    "children" SMALLINT NOT NULL DEFAULT 0,
    "infants" SMALLINT NOT NULL DEFAULT 0,
    "seats_required" SMALLINT NOT NULL,
    "hold_expires_at" TIMESTAMPTZ(6),
    "contact_email" VARCHAR(254),
    "contact_phone" VARCHAR(20),
    "total_minor" BIGINT,
    "price_version" INTEGER NOT NULL DEFAULT 0,
    "confirmed_at" TIMESTAMPTZ(6),
    "expired_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_passengers" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "ordinal" SMALLINT NOT NULL,
    "type" "passenger_type" NOT NULL,
    "first_name" VARCHAR(60) NOT NULL,
    "last_name" VARCHAR(60) NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "nationality" CHAR(2),
    "email" VARCHAR(254),
    "phone" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_seats" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "flight_id" UUID NOT NULL,
    "flight_seat_id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_price_lines" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "price_version" INTEGER NOT NULL,
    "kind" "price_line_kind" NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "description" VARCHAR(120) NOT NULL,
    "passenger_id" UUID,
    "amount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_price_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_payment_id" VARCHAR(128),
    "status" "payment_status" NOT NULL DEFAULT 'INITIATED',
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "idempotency_key" VARCHAR(64) NOT NULL,
    "failure_code" VARCHAR(64),
    "provider_metadata" JSONB,
    "succeeded_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_event_id" VARCHAR(128) NOT NULL,
    "payment_id" UUID,
    "type" VARCHAR(64) NOT NULL,
    "source" "payment_event_source" NOT NULL,
    "provider_created_at" TIMESTAMPTZ(6),
    "payload" JSONB NOT NULL,
    "status" "payment_event_status" NOT NULL DEFAULT 'RECEIVED',
    "ignore_reason" VARCHAR(120),
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "ticket_number" VARCHAR(20) NOT NULL,
    "status" "ticket_status" NOT NULL DEFAULT 'PENDING',
    "snapshot_ref" VARCHAR(64),
    "storage_key" VARCHAR(255),
    "sha256" CHAR(64),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "issued_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(40) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "status" "outbox_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "correlation_id" VARCHAR(64),
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "actor_type" "actor_type" NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "correlation_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "scope" VARCHAR(80) NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" "idem_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "response_status" SMALLINT,
    "response_body" JSONB,
    "locked_until" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "market_countries_market_code_idx" ON "market_countries"("market_code");

-- CreateIndex
CREATE UNIQUE INDEX "fee_rules_market_code_code_active_from_key" ON "fee_rules"("market_code", "code", "active_from");

-- CreateIndex
CREATE UNIQUE INDEX "airports_iata_code_key" ON "airports"("iata_code");

-- CreateIndex
CREATE UNIQUE INDEX "airlines_iata_code_key" ON "airlines"("iata_code");

-- CreateIndex
CREATE UNIQUE INDEX "aircraft_types_model_key" ON "aircraft_types"("model");

-- CreateIndex
CREATE UNIQUE INDEX "seat_layouts_aircraft_type_id_version_key" ON "seat_layouts"("aircraft_type_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "layout_cabins_seat_layout_id_cabin_key" ON "layout_cabins"("seat_layout_id", "cabin");

-- CreateIndex
CREATE UNIQUE INDEX "layout_seats_seat_layout_id_row_number_column_letter_key" ON "layout_seats"("seat_layout_id", "row_number", "column_letter");

-- CreateIndex
CREATE UNIQUE INDEX "aircraft_registration_key" ON "aircraft"("registration");

-- CreateIndex
CREATE UNIQUE INDEX "flights_airline_id_flight_number_departure_at_key" ON "flights"("airline_id", "flight_number", "departure_at");

-- CreateIndex
CREATE UNIQUE INDEX "flight_fares_flight_id_cabin_market_code_key" ON "flight_fares"("flight_id", "cabin", "market_code");

-- CreateIndex
CREATE INDEX "flight_seats_flight_id_cabin_status_idx" ON "flight_seats"("flight_id", "cabin", "status");

-- CreateIndex
CREATE UNIQUE INDEX "flight_seats_flight_id_seat_label_key" ON "flight_seats"("flight_id", "seat_label");

-- CreateIndex
CREATE UNIQUE INDEX "flight_seats_flight_id_layout_seat_id_key" ON "flight_seats"("flight_id", "layout_seat_id");

-- CreateIndex
CREATE UNIQUE INDEX "flight_seats_id_flight_id_key" ON "flight_seats"("id", "flight_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_reference_key" ON "bookings"("reference");

-- CreateIndex
CREATE INDEX "bookings_user_id_created_at_idx" ON "bookings"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_id_flight_id_key" ON "bookings"("id", "flight_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_passengers_booking_id_ordinal_key" ON "booking_passengers"("booking_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "booking_passengers_id_booking_id_key" ON "booking_passengers"("id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_seats_booking_id_flight_seat_id_key" ON "booking_seats"("booking_id", "flight_seat_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_seats_passenger_id_booking_id_key" ON "booking_seats"("passenger_id", "booking_id");

-- CreateIndex
CREATE INDEX "booking_price_lines_booking_id_price_version_idx" ON "booking_price_lines"("booking_id", "price_version");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_booking_id_idempotency_key_key" ON "payments"("booking_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_payment_id_key" ON "payments"("provider", "provider_payment_id");

-- CreateIndex
CREATE INDEX "payment_events_payment_id_idx" ON "payment_events"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_provider_event_id_key" ON "payment_events"("provider", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticket_number_key" ON "tickets"("ticket_number");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_booking_id_version_key" ON "tickets"("booking_id", "version");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_user_id_scope_key_key" ON "idempotency_keys"("user_id", "scope", "key");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_countries" ADD CONSTRAINT "market_countries_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_rules" ADD CONSTRAINT "fee_rules_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_layouts" ADD CONSTRAINT "seat_layouts_aircraft_type_id_fkey" FOREIGN KEY ("aircraft_type_id") REFERENCES "aircraft_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layout_cabins" ADD CONSTRAINT "layout_cabins_seat_layout_id_fkey" FOREIGN KEY ("seat_layout_id") REFERENCES "seat_layouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layout_seats" ADD CONSTRAINT "layout_seats_seat_layout_id_fkey" FOREIGN KEY ("seat_layout_id") REFERENCES "seat_layouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_airline_id_fkey" FOREIGN KEY ("airline_id") REFERENCES "airlines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_aircraft_type_id_fkey" FOREIGN KEY ("aircraft_type_id") REFERENCES "aircraft_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_seat_layout_id_fkey" FOREIGN KEY ("seat_layout_id") REFERENCES "seat_layouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_airline_id_fkey" FOREIGN KEY ("airline_id") REFERENCES "airlines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_origin_airport_id_fkey" FOREIGN KEY ("origin_airport_id") REFERENCES "airports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_destination_airport_id_fkey" FOREIGN KEY ("destination_airport_id") REFERENCES "airports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "aircraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_seat_layout_id_fkey" FOREIGN KEY ("seat_layout_id") REFERENCES "seat_layouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_fares" ADD CONSTRAINT "flight_fares_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_fares" ADD CONSTRAINT "flight_fares_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_seats" ADD CONSTRAINT "flight_seats_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_seats" ADD CONSTRAINT "flight_seats_layout_seat_id_fkey" FOREIGN KEY ("layout_seat_id") REFERENCES "layout_seats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_seats" ADD CONSTRAINT "flight_seats_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_passengers" ADD CONSTRAINT "booking_passengers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_booking_id_flight_id_fkey" FOREIGN KEY ("booking_id", "flight_id") REFERENCES "bookings"("id", "flight_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_flight_seat_id_flight_id_fkey" FOREIGN KEY ("flight_seat_id", "flight_id") REFERENCES "flight_seats"("id", "flight_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_passenger_id_booking_id_fkey" FOREIGN KEY ("passenger_id", "booking_id") REFERENCES "booking_passengers"("id", "booking_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_price_lines" ADD CONSTRAINT "booking_price_lines_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_price_lines" ADD CONSTRAINT "booking_price_lines_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "booking_passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════════════════════
-- Hand-written constraints Prisma cannot express (docs §6.4). The application validates
-- the same rules for friendly errors; these are the backstop against races and bugs.
-- ═════════════════════════════════════════════════════════════════════════════

-- Identity
ALTER TABLE users
  ADD CONSTRAINT users_nationality_chk CHECK (nationality ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT users_email_len_chk CHECK (char_length(email) BETWEEN 3 AND 254),
  ADD CONSTRAINT users_session_version_chk CHECK (session_version >= 1);

-- Markets & pricing rules
ALTER TABLE markets
  ADD CONSTRAINT markets_currency_chk CHECK (currency ~ '^[A-Z]{3}$');
-- Exactly zero or one default market.
CREATE UNIQUE INDEX markets_single_default_ux ON markets (is_default) WHERE is_default;

ALTER TABLE market_countries
  ADD CONSTRAINT market_countries_code_chk CHECK (country_code ~ '^[A-Z]{2}$');

ALTER TABLE fee_rules
  ADD CONSTRAINT fee_rules_value_chk CHECK (value >= 0),
  ADD CONSTRAINT fee_rules_bps_chk CHECK (kind <> 'PERCENT_OF_BASE_BPS' OR value <= 10000),
  ADD CONSTRAINT fee_rules_seat_kind_chk CHECK ((kind = 'SEAT_KIND_SURCHARGE') = (seat_kind IS NOT NULL)),
  ADD CONSTRAINT fee_rules_window_chk CHECK (active_to IS NULL OR active_to > active_from);

-- Reference data
ALTER TABLE airports
  ADD CONSTRAINT airports_iata_chk CHECK (iata_code ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT airports_country_chk CHECK (country_code ~ '^[A-Z]{2}$');
CREATE INDEX airports_city_trgm_idx ON airports USING gin (city gin_trgm_ops);
CREATE INDEX airports_name_trgm_idx ON airports USING gin (name gin_trgm_ops);

ALTER TABLE airlines
  ADD CONSTRAINT airlines_iata_chk CHECK (iata_code ~ '^[A-Z0-9]{2}$');

ALTER TABLE layout_cabins
  ADD CONSTRAINT layout_cabins_rows_chk CHECK (first_row >= 1 AND last_row >= first_row),
  ADD CONSTRAINT layout_cabins_pattern_chk CHECK (column_pattern ~ '^[A-Z](_?[A-Z])*$');

ALTER TABLE layout_seats
  ADD CONSTRAINT layout_seats_row_chk CHECK (row_number >= 1),
  ADD CONSTRAINT layout_seats_column_chk CHECK (column_letter ~ '^[A-Z]$');

-- Flights
ALTER TABLE flights
  ADD CONSTRAINT flights_times_chk CHECK (arrival_at > departure_at),
  ADD CONSTRAINT flights_route_chk CHECK (origin_airport_id <> destination_airport_id),
  ADD CONSTRAINT flights_number_chk CHECK (flight_number ~ '^[A-Z0-9]{2}[0-9]{1,4}$');
-- Search: route + departure window, bookable flights only.
CREATE INDEX flights_search_idx ON flights (origin_airport_id, destination_airport_id, departure_at)
  WHERE status IN ('SCHEDULED', 'DELAYED');

ALTER TABLE flight_fares
  ADD CONSTRAINT flight_fares_amount_chk CHECK (base_fare_minor >= 0),
  ADD CONSTRAINT flight_fares_currency_chk CHECK (currency ~ '^[A-Z]{3}$');

-- Seat inventory: status and ownership must agree (docs §6.4, §9).
ALTER TABLE flight_seats
  ADD CONSTRAINT flight_seats_owner_chk CHECK (
       (status IN ('AVAILABLE', 'BLOCKED') AND booking_id IS NULL AND hold_expires_at IS NULL)
    OR (status = 'HELD'   AND booking_id IS NOT NULL AND hold_expires_at IS NOT NULL)
    OR (status = 'BOOKED' AND booking_id IS NOT NULL AND hold_expires_at IS NULL)
  );
CREATE INDEX flight_seats_held_expiry_idx ON flight_seats (hold_expires_at) WHERE status = 'HELD';
CREATE INDEX flight_seats_booking_idx ON flight_seats (booking_id) WHERE booking_id IS NOT NULL;

-- Bookings
ALTER TABLE bookings
  ADD CONSTRAINT bookings_reference_chk CHECK (reference ~ '^[A-HJ-NP-Z2-9]{6}$'),
  ADD CONSTRAINT bookings_currency_chk CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT bookings_pax_chk CHECK (
    adults >= 1 AND children >= 0 AND infants >= 0 AND infants <= adults
    AND seats_required = adults + children AND seats_required BETWEEN 1 AND 9
  ),
  ADD CONSTRAINT bookings_total_chk CHECK (total_minor IS NULL OR total_minor >= 0),
  ADD CONSTRAINT bookings_hold_chk CHECK (status NOT IN ('PENDING', 'PAYMENT_PENDING') OR hold_expires_at IS NOT NULL),
  ADD CONSTRAINT bookings_confirmed_chk CHECK (status <> 'CONFIRMED' OR (confirmed_at IS NOT NULL AND total_minor IS NOT NULL)),
  ADD CONSTRAINT bookings_expired_chk CHECK (status <> 'EXPIRED' OR expired_at IS NOT NULL),
  ADD CONSTRAINT bookings_cancelled_chk CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL);
CREATE INDEX bookings_active_hold_idx ON bookings (hold_expires_at) WHERE status IN ('PENDING', 'PAYMENT_PENDING');

ALTER TABLE booking_passengers
  ADD CONSTRAINT booking_passengers_ordinal_chk CHECK (ordinal BETWEEN 1 AND 9),
  ADD CONSTRAINT booking_passengers_nationality_chk CHECK (nationality IS NULL OR nationality ~ '^[A-Z]{2}$');

ALTER TABLE booking_price_lines
  ADD CONSTRAINT booking_price_lines_sign_chk CHECK (
    (kind = 'DISCOUNT' AND amount_minor <= 0) OR (kind <> 'DISCOUNT' AND amount_minor >= 0)
  );

-- Payments: at most one successful and one in-flight attempt per booking.
ALTER TABLE payments
  ADD CONSTRAINT payments_amount_chk CHECK (amount_minor >= 0),
  ADD CONSTRAINT payments_currency_chk CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT payments_succeeded_chk CHECK (status <> 'SUCCEEDED' OR succeeded_at IS NOT NULL);
CREATE UNIQUE INDEX payments_one_success_ux ON payments (booking_id) WHERE status = 'SUCCEEDED';
CREATE UNIQUE INDEX payments_one_inflight_ux ON payments (booking_id)
  WHERE status IN ('INITIATED', 'PROCESSING', 'REQUIRES_ACTION');
CREATE INDEX payments_stuck_idx ON payments (created_at) WHERE status IN ('INITIATED', 'PROCESSING');

-- Tickets: at most one issued ticket per booking.
ALTER TABLE tickets
  ADD CONSTRAINT tickets_version_chk CHECK (version >= 1),
  ADD CONSTRAINT tickets_issued_chk CHECK (
    status <> 'ISSUED' OR (issued_at IS NOT NULL AND storage_key IS NOT NULL AND sha256 IS NOT NULL)
  );
CREATE UNIQUE INDEX tickets_one_issued_ux ON tickets (booking_id) WHERE status = 'ISSUED';

-- Outbox relay scan.
CREATE INDEX outbox_events_pending_idx ON outbox_events (available_at) WHERE status = 'PENDING';

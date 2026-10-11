-- Idempotent bootstrap of the FlyGo databases on an EXISTING PostgreSQL server.
-- Run as a superuser via scripts/db-bootstrap.sh. Never touches other databases.
-- psql variable: :app_password
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE flygo_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flygo_app') \gexec

-- Keep the password in sync with .env when the role already exists.
SELECT format('ALTER ROLE flygo_app PASSWORD %L', :'app_password') \gexec

SELECT 'CREATE DATABASE flygo OWNER flygo_app ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'flygo') \gexec

-- Shadow database used only by `prisma migrate dev` to detect drift.
SELECT 'CREATE DATABASE flygo_shadow OWNER flygo_app ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'flygo_shadow') \gexec

-- Isolated database for integration tests (migrated and truncated by the test suite).
SELECT 'CREATE DATABASE flygo_test OWNER flygo_app ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'flygo_test') \gexec

REVOKE ALL ON DATABASE flygo FROM PUBLIC;
REVOKE ALL ON DATABASE flygo_test FROM PUBLIC;
REVOKE ALL ON DATABASE flygo_shadow FROM PUBLIC;

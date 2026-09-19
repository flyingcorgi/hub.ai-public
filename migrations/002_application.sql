-- Application-owned authorization/billing/catalog. Auth core schema is library-generated.
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user';
ALTER TABLE "user" ADD CONSTRAINT user_role CHECK ("role" IN ('user', 'admin'));
CREATE UNIQUE INDEX user_email_normalized ON "user" (lower("email"));
CREATE UNIQUE INDEX account_provider_identity ON "account" ("providerId", "accountId");

CREATE TABLE subscriptions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  plan_id text NOT NULL,
  provider_id text UNIQUE,
  status text NOT NULL CHECK (status IN ('creating', 'active', 'needs_reconciliation')),
  amount_usd numeric(12,2) NOT NULL CHECK (amount_usd > 0),
  interval_days integer NOT NULL CHECK (interval_days > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, plan_id)
);
CREATE TABLE entitlements (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE RESTRICT,
  paid_through_at timestamptz NOT NULL,
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE payment_events (
  payment_id text PRIMARY KEY,
  subscription_id text NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  amount_usd numeric(12,2) NOT NULL CHECK (amount_usd > 0),
  currency text NOT NULL CHECK (currency = 'usd'),
  processed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Inline curated reference data remains protected inside JSON for this phase. It is product
-- content, never an import of personal album/game files. Asset extraction is a later migration.
CREATE TABLE workflow_catalog_revision (
  id integer PRIMARY KEY CHECK (id = 1),
  revision integer NOT NULL DEFAULT 0
);
INSERT INTO workflow_catalog_revision (id) VALUES (1);
CREATE TABLE workflows (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT '',
  free boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT false,
  definition jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

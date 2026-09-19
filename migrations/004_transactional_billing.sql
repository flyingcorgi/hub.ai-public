-- Enrollment status is not paid access. Billing email is an account-bound contact snapshot.
ALTER TABLE subscriptions ADD COLUMN billing_email text;
UPDATE subscriptions s SET billing_email=lower(u.email) FROM "user" u WHERE u.id=s.user_id;
ALTER TABLE subscriptions ALTER COLUMN billing_email SET NOT NULL;
ALTER TABLE subscriptions ADD COLUMN last_error_code text CHECK (last_error_code IN ('provider_unavailable', 'provider_mismatch', 'operator_review'));

-- The public recurring-IPN contract does not document a payment->subscription field. Until
-- confirmed, only an explicit operator-verified binding may associate a payment with an owner.
-- Never derive ownership from email, order_id, plan ID, or guessed webhook field aliases.
CREATE TABLE billing_payment_bindings (
  payment_id text PRIMARY KEY,
  subscription_id text NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  source text NOT NULL DEFAULT 'operator' CHECK (source = 'operator'),
  confirmed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE payment_events ADD COLUMN status text NOT NULL DEFAULT 'settled' CHECK (status IN ('settled', 'refunded'));
ALTER TABLE payment_events ADD COLUMN pay_currency text;
ALTER TABLE payment_events ADD COLUMN quoted_amount numeric(48,18);
ALTER TABLE payment_events ADD COLUMN actually_paid numeric(48,18);
ALTER TABLE payment_events ADD COLUMN granted_through_at timestamptz;
ALTER TABLE payment_events ADD COLUMN reversed_at timestamptz;
ALTER TABLE entitlements ADD COLUMN revocation_reason text;
CREATE INDEX subscriptions_owner ON subscriptions(user_id);
CREATE INDEX payment_events_subscription ON payment_events(subscription_id);

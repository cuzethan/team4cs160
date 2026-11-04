-- Declined card payments, for the manager's failed-payments report.
-- Safe to apply to both new databases and existing databases.
CREATE TABLE IF NOT EXISTS FailedPayment (
  failed_payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
  payment_intent_id VARCHAR(255) NOT NULL,
  failure_key VARCHAR(255) NOT NULL UNIQUE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
  failure_code VARCHAR(100),
  decline_code VARCHAR(100),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS failed_payment_created_at_idx ON FailedPayment (created_at);

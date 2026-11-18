-- Each shopper's Stripe customer, so cards they save at checkout are offered next time.
ALTER TABLE Users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

-- Runs once, the first time the Postgres data volume is created.
-- Schema for OFS goes in this directory.
--
-- If the database volume already exists, this file is not re-run.
-- Recreate it with: docker compose down -v && docker compose up --build

CREATE TABLE users (
  user_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  email           text NOT NULL,
  phone           text NOT NULL,
  password_hash   text NOT NULL,
  role            text NOT NULL DEFAULT 'customer'
                    CHECK (role IN ('customer', 'admin')),
  account_status  text NOT NULL DEFAULT 'active'
                    CHECK (account_status IN ('active', 'disabled')),
  -- Security question for password recovery. The answer is stored as a bcrypt hash.
  question_choice text NOT NULL
                    CHECK (question_choice IN ('What was the name of your last pet?', 'Who was your favorite teacher?', 'What is your dream car?')),
  answer_hash     text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Login is by email. Treat "Lee@ofs.com" and "lee@ofs.com" as the same address.
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

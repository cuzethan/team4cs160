-- Login sessions and password recovery tokens.
--
-- Like 001_init.sql, this only runs on a fresh database volume.
-- Recreate it with: docker compose down -v && docker compose up --build

-- One row per logged-in browser. The cookie holds a random token; only its
-- SHA-256 hash is stored, so a leaked table can't be used to log in.
CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- Single-use tokens handed out after a correct security answer. Also stored as a hash.
CREATE TABLE password_reset_tokens (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

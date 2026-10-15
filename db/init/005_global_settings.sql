-- Global delivery pricing shared by managers and all customer checkouts.
-- Safe to apply to both new databases and existing databases.
CREATE TABLE IF NOT EXISTS GlobalSettings (
  settings_id SMALLINT PRIMARY KEY CHECK (settings_id = 1),
  delivery_fee DECIMAL(10,2) NOT NULL CHECK (delivery_fee >= 0),
  free_delivery_weight_threshold DECIMAL(10,2) NOT NULL CHECK (free_delivery_weight_threshold > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO GlobalSettings (settings_id, delivery_fee, free_delivery_weight_threshold)
VALUES (1, 10, 20)
ON CONFLICT (settings_id) DO NOTHING;

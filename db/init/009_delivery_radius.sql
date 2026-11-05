ALTER TABLE GlobalSettings
  ADD COLUMN IF NOT EXISTS delivery_radius_miles DECIMAL(10,2) NOT NULL DEFAULT 50
  CHECK (delivery_radius_miles > 0);

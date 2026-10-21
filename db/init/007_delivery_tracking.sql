-- Delivery tracking fields used by the mock robot fleet and customer tracking API.
-- The backend applies the same additive changes at startup for existing volumes.

ALTER TABLE Robot
  ALTER COLUMN maximum_orders SET DEFAULT 10,
  ALTER COLUMN maximum_weight SET DEFAULT 200;

ALTER TABLE DeliveryRun
  ADD COLUMN IF NOT EXISTS route_geometry JSONB,
  ADD COLUMN IF NOT EXISTS route_source VARCHAR(30),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE Notification
  ADD COLUMN IF NOT EXISTS notification_type VARCHAR(50) NOT NULL DEFAULT 'delivery_update',
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS delivery_order_status_idx ON Delivery(delivery_status, order_id);
CREATE INDEX IF NOT EXISTS delivery_run_status_idx ON DeliveryRun(run_status, robot_id);
CREATE INDEX IF NOT EXISTS delivery_run_simulation_idx ON DeliveryRun(run_status, created_at);
CREATE INDEX IF NOT EXISTS notification_user_created_idx ON Notification(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_single_assignment_idx ON Delivery(order_id);

COMMENT ON COLUMN DeliveryRun.route_distance IS 'Route distance in meters';
COMMENT ON COLUMN DeliveryRun.estimated_duration IS 'Estimated route duration in seconds';

-- A small fleet is useful for the mock simulator and can be edited by managers later.
INSERT INTO Robot (robot_name, robot_status, maximum_orders, maximum_weight, current_latitude, current_longitude)
SELECT 'Demo Robot 1', 'available', 10, 200, 37.3382, -121.8863
WHERE NOT EXISTS (SELECT 1 FROM Robot);

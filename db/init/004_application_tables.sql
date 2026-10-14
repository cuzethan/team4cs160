-- Complete the application schema for existing databases that were created
-- before all of 001_init.sql ran. Safe to reapply; existing tables and data stay.

CREATE TABLE IF NOT EXISTS Customer (
  user_id UUID PRIMARY KEY REFERENCES Users(user_id) ON DELETE CASCADE,
  customer_since TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Manager (
  user_id UUID PRIMARY KEY REFERENCES Users(user_id) ON DELETE CASCADE,
  employee_status VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS Address (
  address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
  street VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  zip_code VARCHAR(20) NOT NULL,
  delivery_instructions TEXT,
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6)
);

CREATE TABLE IF NOT EXISTS Product (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    weight DECIMAL(10,2) NOT NULL,
    quantity_in_stock INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_product_price
        CHECK (price >= 0),
    CONSTRAINT chk_product_weight
        CHECK (weight >= 0),
    CONSTRAINT chk_product_stock
        CHECK (quantity_in_stock >= 0)
);

CREATE TABLE IF NOT EXISTS Category (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS PriceHistory (
  price_history_id BIGSERIAL PRIMARY KEY,
  old_price DECIMAL(10,2) NOT NULL,
  new_price DECIMAL(10,2) NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ShoppingCart (
  cart_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES Users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS CartItems (
  cart_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES ShoppingCart(cart_id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES Product(product_id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  CONSTRAINT uq_cart_product UNIQUE (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS Orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES Users(user_id),
  address_id UUID NOT NULL REFERENCES Address(address_id),
  order_status VARCHAR(50) NOT NULL,
  payment_status VARCHAR(50) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  grand_total DECIMAL(10,2) NOT NULL CHECK (grand_total >= 0),
  total_weight DECIMAL(10,2) NOT NULL CHECK (total_weight >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS OrderItem (
  order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES Orders(order_id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES Product(product_id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_at_purchase DECIMAL(10,2) NOT NULL CHECK (price_at_purchase >= 0),
  weight_at_purchase DECIMAL(10,2) NOT NULL CHECK (weight_at_purchase >= 0)
);

CREATE TABLE IF NOT EXISTS Payment (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES Orders(order_id),
  payment_amount DECIMAL(10,2) NOT NULL CHECK (payment_amount >= 0),
  payment_status VARCHAR(50) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  transaction_reference VARCHAR(255),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS Transactions (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES Users(user_id),
  product_id UUID NOT NULL REFERENCES Product(product_id),
  transaction_type VARCHAR(50) NOT NULL,
  quantity_changed INTEGER NOT NULL,
  quantity_after_change INTEGER NOT NULL CHECK (quantity_after_change >= 0),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Robot (
  robot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_name VARCHAR(100) NOT NULL UNIQUE,
  robot_status VARCHAR(50) NOT NULL,
  maximum_orders INTEGER NOT NULL,
  maximum_weight DECIMAL(10,2) NOT NULL,
  current_latitude DECIMAL(9,6),
  current_longitude DECIMAL(9,6),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS DeliveryRun (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_id UUID NOT NULL REFERENCES Robot(robot_id),
  run_status VARCHAR(50) NOT NULL,
  route_distance DECIMAL(10,2),
  estimated_duration INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS Delivery (
  delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES Orders(order_id),
  address_id UUID NOT NULL REFERENCES Address(address_id),
  run_id UUID NOT NULL REFERENCES DeliveryRun(run_id),
  delivery_status VARCHAR(50) NOT NULL,
  stop_number INTEGER NOT NULL CHECK (stop_number > 0),
  estimated_delivery_time TIMESTAMPTZ,
  actual_delivery_time TIMESTAMPTZ,
  arrival_time TIMESTAMPTZ,
  departure_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_run_stop UNIQUE (run_id, stop_number)
);

CREATE TABLE IF NOT EXISTS Setting (
  setting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
  setting_name VARCHAR(100) NOT NULL,
  setting_value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_setting UNIQUE (user_id, setting_name)
);

CREATE TABLE IF NOT EXISTS AuditLog (
  audit_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES Users(user_id) ON DELETE SET NULL,
  affected_table VARCHAR(100) NOT NULL,
  affected_record_id UUID,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Notification (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
  order_id UUID REFERENCES Orders(order_id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON Users (lower(email));
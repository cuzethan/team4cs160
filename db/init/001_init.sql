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

CREATE TABLE Customer (
    user_id UUID PRIMARY KEY,
    customer_since TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_customer_user
        FOREIGN KEY (user_id)
        REFERENCES Users(user_id)
        ON DELETE CASCADE
);
CREATE TABLE Manager (
    user_id UUID PRIMARY KEY,
    employee_status VARCHAR(50) NOT NULL,
    CONSTRAINT fk_manager_user
        FOREIGN KEY (user_id)
        REFERENCES Users(user_id)
        ON DELETE CASCADE
);
CREATE TABLE Address (
    address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    street VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    zip_code VARCHAR(20) NOT NULL,
    delivery_instructions TEXT,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    CONSTRAINT fk_address_user
        FOREIGN KEY (user_id)
        REFERENCES Users(user_id)
        ON DELETE CASCADE
);
CREATE TABLE Category (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);
CREATE TABLE Product (
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
CREATE TABLE PriceHistory (
    price_history_id BIGSERIAL PRIMARY KEY,
    old_price DECIMAL(10, 2) NOT NULL,
    new_price DECIMAL(10, 2) NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE ShoppingCart (
    cart_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cart_user
        FOREIGN KEY (user_id)
        REFERENCES Users(user_id)
        ON DELETE CASCADE
);
CREATE TABLE CartItems (
    cart_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity INTEGER NOT NULL,

    CONSTRAINT fk_cart_item_cart
        FOREIGN KEY (cart_id)
        REFERENCES ShoppingCart(cart_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_cart_item_product
        FOREIGN KEY (product_id)
        REFERENCES Product(product_id),

    CONSTRAINT chk_cart_item_quantity
        CHECK (quantity > 0),

    CONSTRAINT uq_cart_product
        UNIQUE (cart_id, product_id)
);
CREATE TABLE Orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    address_id UUID NOT NULL,
    order_status VARCHAR(50) NOT NULL,
    payment_status VARCHAR(50) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    grand_total DECIMAL(10,2) NOT NULL,
    total_weight DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_user
        FOREIGN KEY (user_id)
        REFERENCES Users(user_id),
    CONSTRAINT fk_order_address
        FOREIGN KEY (address_id)
        REFERENCES Address(address_id),
    CONSTRAINT chk_order_subtotal
        CHECK (subtotal >= 0),
    CONSTRAINT chk_order_delivery_fee
        CHECK (delivery_fee >= 0),
    CONSTRAINT chk_order_total
        CHECK (grand_total >= 0),
    CONSTRAINT chk_order_weight
        CHECK (total_weight >= 0)
);
CREATE TABLE OrderItem (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity INTEGER NOT NULL,
    price_at_purchase DECIMAL(10,2) NOT NULL,
    weight_at_purchase DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_order_item_order
        FOREIGN KEY (order_id)
        REFERENCES Orders(order_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_order_item_product
        FOREIGN KEY (product_id)
        REFERENCES Product(product_id),
    CONSTRAINT chk_order_item_quantity
        CHECK (quantity > 0),
    CONSTRAINT chk_order_item_price
        CHECK (price_at_purchase >= 0),
    CONSTRAINT chk_order_item_weight
        CHECK (weight_at_purchase >= 0)
);
CREATE TABLE Payment (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    payment_amount DECIMAL(10,2) NOT NULL,
    payment_status VARCHAR(50) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    transaction_reference VARCHAR(255),
    processed_at TIMESTAMPTZ,
    CONSTRAINT fk_payment_order
        FOREIGN KEY (order_id)
        REFERENCES Orders(order_id),
    CONSTRAINT chk_payment_amount
        CHECK (payment_amount >= 0)
);
CREATE TABLE Transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    product_id UUID NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    quantity_changed INTEGER NOT NULL,
    quantity_after_change INTEGER NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_transaction_user
        FOREIGN KEY (user_id)
        REFERENCES Users(user_id),
    CONSTRAINT fk_transaction_product
        FOREIGN KEY (product_id)
        REFERENCES Product(product_id),
    CONSTRAINT chk_transaction_quantity
        CHECK (quantity_after_change >= 0)
);
CREATE TABLE Robot (
    robot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    robot_name VARCHAR(100) NOT NULL UNIQUE,
    robot_status VARCHAR(50) NOT NULL,
    maximum_orders INTEGER NOT NULL,
    maximum_weight DECIMAL(10,2) NOT NULL,
    current_latitude DECIMAL(9,6),
    current_longitude DECIMAL(9,6),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE DeliveryRun (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    robot_id UUID NOT NULL,
    run_status VARCHAR(50) NOT NULL,
    route_distance DECIMAL(10,2),
    estimated_duration INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT fk_delivery_run_robot
        FOREIGN KEY (robot_id)
        REFERENCES Robot(robot_id)
);
CREATE TABLE Delivery (
    delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    address_id UUID NOT NULL,
    run_id UUID NOT NULL,
    delivery_status VARCHAR(50) NOT NULL,
    stop_number INTEGER NOT NULL,
    estimated_delivery_time TIMESTAMPTZ,
    actual_delivery_time TIMESTAMPTZ,
    arrival_time TIMESTAMPTZ,
    departure_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_delivery_order
        FOREIGN KEY (order_id)
        REFERENCES Orders(order_id),
    CONSTRAINT fk_delivery_address
        FOREIGN KEY (address_id)
        REFERENCES Address(address_id),
    CONSTRAINT fk_delivery_run
        FOREIGN KEY (run_id)
        REFERENCES DeliveryRun(run_id),
    CONSTRAINT chk_delivery_stop_number
        CHECK (stop_number > 0),
    CONSTRAINT uq_run_stop
        UNIQUE (run_id, stop_number)
);
CREATE TABLE Setting (
    setting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    setting_name VARCHAR(100) NOT NULL,
    setting_value TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_setting_user
        FOREIGN KEY (user_id)
        REFERENCES Users(user_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_user_setting
        UNIQUE (user_id, setting_name)
);
CREATE TABLE AuditLog (
    audit_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    affected_table VARCHAR(100) NOT NULL,
    affected_record_id UUID,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_log_user
        FOREIGN KEY (user_id)
        REFERENCES Users(user_id)
        ON DELETE SET NULL
);
CREATE TABLE Notification (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    order_id UUID,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_user
        FOREIGN KEY (user_id)
        REFERENCES Users(user_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_notification_order
        FOREIGN KEY (order_id)
        REFERENCES Orders(order_id)
        ON DELETE SET NULL
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

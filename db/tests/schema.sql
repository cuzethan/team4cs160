BEGIN;

SELECT plan(47);

SELECT has_table('public', 'users', 'users table exists');
SELECT has_table('public', 'customer', 'customer table exists');
SELECT has_table('public', 'manager', 'manager table exists');
SELECT has_table('public', 'address', 'address table exists');
SELECT has_table('public', 'category', 'category table exists');
SELECT has_table('public', 'product', 'product table exists');
SELECT has_table('public', 'pricehistory', 'price history table exists');
SELECT has_table('public', 'shoppingcart', 'shopping cart table exists');
SELECT has_table('public', 'cartitems', 'cart items table exists');
SELECT has_table('public', 'orders', 'orders table exists');
SELECT has_table('public', 'orderitem', 'order items table exists');
SELECT has_table('public', 'payment', 'payment table exists');
SELECT has_table('public', 'transactions', 'transactions table exists');
SELECT has_table('public', 'robot', 'robot table exists');
SELECT has_table('public', 'deliveryrun', 'delivery run table exists');
SELECT has_table('public', 'delivery', 'delivery table exists');
SELECT has_table('public', 'setting', 'setting table exists');
SELECT has_table('public', 'auditlog', 'audit log table exists');
SELECT has_table('public', 'notification', 'notification table exists');
SELECT has_table('public', 'sessions', 'sessions table exists');
SELECT has_table('public', 'password_reset_tokens', 'password reset tokens table exists');
SELECT has_table('public', 'globalsettings', 'global settings table exists');

SELECT has_column('public', 'product', 'unit_cost', 'products track unit cost');
SELECT has_column('public', 'orderitem', 'cost_at_purchase', 'order items preserve purchase cost');
SELECT has_column('public', 'pricehistory', 'product_id', 'price history identifies the product');
SELECT has_column('public', 'pricehistory', 'changed_by', 'price history identifies the manager');
SELECT has_column('public', 'deliveryrun', 'route_geometry', 'delivery runs store route geometry');
SELECT has_column('public', 'deliveryrun', 'route_source', 'delivery runs store route source');
SELECT has_column('public', 'deliveryrun', 'created_at', 'delivery runs record creation time');
SELECT has_column('public', 'deliveryrun', 'updated_at', 'delivery runs record update time');
SELECT has_column('public', 'notification', 'notification_type', 'notifications have a type');
SELECT has_column('public', 'notification', 'read_at', 'notifications record when they are read');

SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.product'::regclass AND conname = 'chk_product_price'),
  'product price cannot be negative'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.product'::regclass AND conname = 'chk_product_stock'),
  'product stock cannot be negative'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.product'::regclass AND conname = 'product_unit_cost_nonnegative'),
  'product unit cost cannot be negative'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orderitem'::regclass AND conname = 'chk_order_item_quantity'),
  'order item quantity must be positive'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orderitem'::regclass AND conname = 'order_item_cost_at_purchase_nonnegative'),
  'purchase cost cannot be negative'
);

SELECT has_index('public', 'users', 'users_email_lower_idx', 'user email lookup is case insensitive');
SELECT has_index('public', 'delivery', 'delivery_order_status_idx', 'delivery status lookup is indexed');
SELECT has_index('public', 'deliveryrun', 'delivery_run_status_idx', 'delivery run status lookup is indexed');
SELECT has_index('public', 'deliveryrun', 'delivery_run_simulation_idx', 'delivery simulation lookup is indexed');
SELECT has_index('public', 'notification', 'notification_user_created_idx', 'notifications are indexed by user and time');
SELECT has_index('public', 'delivery', 'delivery_single_assignment_idx', 'orders cannot have multiple active deliveries');

SELECT is(
  (SELECT delivery_fee::numeric FROM globalsettings WHERE settings_id = 1),
  10::numeric,
  'default delivery fee is 10'
);
SELECT is(
  (SELECT free_delivery_weight_threshold::numeric FROM globalsettings WHERE settings_id = 1),
  20::numeric,
  'default free delivery threshold is 20'
);
SELECT is((SELECT count(*) FROM category), 3::bigint, 'starter categories are seeded');
SELECT is((SELECT count(*) FROM product), 12::bigint, 'starter products are seeded');

SELECT * FROM finish();

ROLLBACK;

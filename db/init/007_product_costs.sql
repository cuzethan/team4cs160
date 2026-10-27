-- Track product unit cost and preserve the cost used for each checkout.
ALTER TABLE Product
  ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10, 2);

ALTER TABLE OrderItem
  ADD COLUMN IF NOT EXISTS cost_at_purchase DECIMAL(10, 2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_unit_cost_nonnegative') THEN
    ALTER TABLE Product ADD CONSTRAINT product_unit_cost_nonnegative
      CHECK (unit_cost IS NULL OR unit_cost >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_item_cost_at_purchase_nonnegative') THEN
    ALTER TABLE OrderItem ADD CONSTRAINT order_item_cost_at_purchase_nonnegative
      CHECK (cost_at_purchase IS NULL OR cost_at_purchase >= 0);
  END IF;
END $$;

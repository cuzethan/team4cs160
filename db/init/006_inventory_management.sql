-- Price history for manager product edits: which product changed and who changed it.
-- Safe to apply to both new databases and existing databases.
ALTER TABLE PriceHistory
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES Product(product_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS changed_by UUID REFERENCES Users(user_id) ON DELETE SET NULL;

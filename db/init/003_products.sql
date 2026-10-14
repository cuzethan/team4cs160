-- Product categories, units, and the starter catalog.
--
-- The product ids are fixed so they stay the same on every fresh database.
--
-- Like the other init files, this only runs on a fresh database volume.
-- Recreate it with: docker compose down -v && docker compose up --build

-- Existing volumes may predate the catalog tables, and init scripts do not
-- run again for those volumes. Create the base tables if they are missing.

-- Which category a product is listed under, and what one unit of it is ("lb", "bag", ...).
ALTER TABLE Product
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES Category (category_id),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20) NOT NULL DEFAULT 'each';

INSERT INTO Category (category_id, category_name, description) VALUES
  ('00000000-0000-4000-9000-000000000001', 'Fruits', 'Apples, berries, bananas and more'),
  ('00000000-0000-4000-9000-000000000002', 'Vegetables', 'Fresh greens, roots, and everyday vegetables'),
  ('00000000-0000-4000-9000-000000000003', 'Grains', 'Rice, bread, oats, and pantry staples')
ON CONFLICT DO NOTHING;

INSERT INTO Product (product_id, product_name, description, price, weight, quantity_in_stock, category_id, unit) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Gala Apples', 'Sweet, crisp Gala apples with a bright red skin. A perfect snack for lunchboxes or a fresh addition to salads.', 1.49, 1.00, 34, '00000000-0000-4000-9000-000000000001', 'lb'),
  ('00000000-0000-4000-8000-000000000002', 'Organic Bananas', 'Naturally sweet organic bananas, picked at their best and ready for smoothies, baking, or an easy snack.', 0.89, 1.00, 42, '00000000-0000-4000-9000-000000000001', 'lb'),
  ('00000000-0000-4000-8000-000000000003', 'Hass Avocados', 'Creamy ripe Hass avocados with rich flavor. Mash them for toast or dice them into your favorite bowl.', 1.25, 0.40, 18, '00000000-0000-4000-9000-000000000001', 'each'),
  ('00000000-0000-4000-8000-000000000004', 'Fresh Strawberries', 'Juicy, fragrant strawberries packed fresh for snacking, desserts, or a colorful breakfast topping.', 4.29, 1.00, 16, '00000000-0000-4000-9000-000000000001', 'basket'),
  ('00000000-0000-4000-8000-000000000005', 'Rainbow Carrots', 'A colorful bunch of sweet and crunchy carrots. Roast them, shred them into salads, or enjoy them raw.', 2.19, 1.50, 21, '00000000-0000-4000-9000-000000000002', 'bunch'),
  ('00000000-0000-4000-8000-000000000006', 'Green Broccoli', 'Fresh green broccoli crowns with tender stems. Steam, roast, or stir-fry for a quick, versatile side.', 2.49, 0.80, 13, '00000000-0000-4000-9000-000000000002', 'each'),
  ('00000000-0000-4000-8000-000000000007', 'Vine Tomatoes', 'Ripe tomatoes grown on the vine for a juicy texture and balanced sweetness in sandwiches and salads.', 2.99, 1.00, 24, '00000000-0000-4000-9000-000000000002', 'lb'),
  ('00000000-0000-4000-8000-000000000008', 'Sweet Corn', 'Golden sweet corn with tender kernels. Grill it in the husk or boil for a simple summer favorite.', 0.79, 0.70, 30, '00000000-0000-4000-9000-000000000002', 'each'),
  ('00000000-0000-4000-8000-000000000009', 'Baby Spinach', 'Tender baby spinach leaves, washed and ready to add to salads, omelets, pastas, and smoothies.', 3.49, 0.31, 12, '00000000-0000-4000-9000-000000000002', 'bag'),
  ('00000000-0000-4000-8000-000000000010', 'Jasmine Rice', 'Fragrant long-grain jasmine rice that cooks up light and fluffy. A lovely everyday base for many meals.', 5.99, 2.00, 19, '00000000-0000-4000-9000-000000000003', 'bag'),
  ('00000000-0000-4000-8000-000000000011', 'Whole Grain Bread', 'Soft, hearty whole grain bread baked with a blend of grains and seeds for a satisfying everyday loaf.', 4.19, 1.20, 11, '00000000-0000-4000-9000-000000000003', 'loaf'),
  ('00000000-0000-4000-8000-000000000012', 'Rolled Oats', 'Whole rolled oats for warm breakfasts, overnight oats, homemade granola, or baking.', 3.79, 2.00, 27, '00000000-0000-4000-9000-000000000003', 'bag')
ON CONFLICT DO NOTHING;

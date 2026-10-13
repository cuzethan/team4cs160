-- Starter catalog so the cart has real products to reference.
--
-- The ids are fixed because the frontend catalog in
-- frontend/src/inventory/InventoryPage.tsx uses the same ones until the
-- products API exists. Keep the two lists in sync.
--
-- Like the other init files, this only runs on a fresh database volume.
-- Recreate it with: docker compose down -v && docker compose up --build

INSERT INTO Product (product_id, product_name, description, price, weight, quantity_in_stock) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Gala Apples', 'Sweet, crisp Gala apples with a bright red skin. A perfect snack for lunchboxes or a fresh addition to salads.', 1.49, 1.00, 34),
  ('00000000-0000-4000-8000-000000000002', 'Organic Bananas', 'Naturally sweet organic bananas, picked at their best and ready for smoothies, baking, or an easy snack.', 0.89, 1.00, 42),
  ('00000000-0000-4000-8000-000000000003', 'Hass Avocados', 'Creamy ripe Hass avocados with rich flavor. Mash them for toast or dice them into your favorite bowl.', 1.25, 0.40, 18),
  ('00000000-0000-4000-8000-000000000004', 'Fresh Strawberries', 'Juicy, fragrant strawberries packed fresh for snacking, desserts, or a colorful breakfast topping.', 4.29, 1.00, 16),
  ('00000000-0000-4000-8000-000000000005', 'Rainbow Carrots', 'A colorful bunch of sweet and crunchy carrots. Roast them, shred them into salads, or enjoy them raw.', 2.19, 1.50, 21),
  ('00000000-0000-4000-8000-000000000006', 'Green Broccoli', 'Fresh green broccoli crowns with tender stems. Steam, roast, or stir-fry for a quick, versatile side.', 2.49, 0.80, 13),
  ('00000000-0000-4000-8000-000000000007', 'Vine Tomatoes', 'Ripe tomatoes grown on the vine for a juicy texture and balanced sweetness in sandwiches and salads.', 2.99, 1.00, 24),
  ('00000000-0000-4000-8000-000000000008', 'Sweet Corn', 'Golden sweet corn with tender kernels. Grill it in the husk or boil for a simple summer favorite.', 0.79, 0.70, 30),
  ('00000000-0000-4000-8000-000000000009', 'Baby Spinach', 'Tender baby spinach leaves, washed and ready to add to salads, omelets, pastas, and smoothies.', 3.49, 0.31, 12),
  ('00000000-0000-4000-8000-000000000010', 'Jasmine Rice', 'Fragrant long-grain jasmine rice that cooks up light and fluffy. A lovely everyday base for many meals.', 5.99, 2.00, 19),
  ('00000000-0000-4000-8000-000000000011', 'Whole Grain Bread', 'Soft, hearty whole grain bread baked with a blend of grains and seeds for a satisfying everyday loaf.', 4.19, 1.20, 11),
  ('00000000-0000-4000-8000-000000000012', 'Rolled Oats', 'Whole rolled oats for warm breakfasts, overnight oats, homemade granola, or baking.', 3.79, 2.00, 27);

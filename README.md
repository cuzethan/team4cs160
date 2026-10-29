### Team 4 - OFS Delivery System

## Login/logout update

**Login/logout is on main.** Run these after pulling:

```bash
git checkout main
git pull
docker compose down -v
docker compose up --build
docker compose exec backend npm run create-manager -- manager@ofs.com manager123 Max Boss
```

Run the last command in a second terminal while the app is running.

If a port is already in use, replace the `up` command with:
```bash
DB_PORT=5433 API_PORT=3002 docker compose up --build
```

## Valhalla routing

The backend uses Valhalla for road-network route optimization. Append these values to the `.env` file in the repository root (keep any Stripe values already there):

```env
VALHALLA_TILE_URL=https://download.geofabrik.de/north-america/us/california/norcal-latest.osm.pbf
VALHALLA_URL=http://valhalla:8002
```

The tile URL supplies the OpenStreetMap region Valhalla builds its routing graph from. The first start downloads the extract and builds graph tiles; this can take a while and needs disk space. The configured Northern California extract covers the app's San Jose demo robot. See the [Geofabrik Northern California downloads](https://download.geofabrik.de/north-america/us/california/norcal.html).

1. Add the two values above to the root `.env` file.
2. Start the stack from the repository root:

   ```bash
   docker compose up -d
   ```

   To rebuild the application images as well, use `docker compose up -d --build`.

3. Watch Valhalla startup and wait for its graph setup and service startup to finish before dispatching deliveries:

   ```bash
   docker compose logs -f valhalla
   ```

   Press Ctrl+C to stop following the logs; the container keeps running. If Valhalla is unavailable or its graph has not finished building, delivery routing falls back to an approximate straight-line route.

## Robot base location and reset

The robot depot defaults to the current San Jose demo location. To use a different base, add these optional values to the root `.env` file (coordinates are decimal degrees):

```env
ROBOT_BASE_LATITUDE=37.3382
ROBOT_BASE_LONGITUDE=-121.8863
```

The base is used when the first demo robot is created and to bias address geocoding. Existing robot positions are not moved automatically when these values change. To stop active runs, return every robot to the configured base, and make undelivered orders available for dispatch again, stop the backend and run:

```bash
docker compose stop backend
docker compose run --rm backend npm run reset-robots
docker compose start backend
```

The reset command preserves completed deliveries. Stop the backend first so its simulator does not update robot positions while the reset is running.

## Start

Docker Desktop needs to be running.

From the repo root:

```bash
docker compose up --build
```

If another app is already using port 5432 or 3001, pick other ports for this one:

```bash
DB_PORT=5433 API_PORT=3002 docker compose up --build
```

Then open:

- Site: http://localhost:5173
- API health: http://localhost:3001/health
- Postgres: `localhost:5432` (user `ofs`, password `ofs`, database `ofs`)

Stop the stack with:

```bash
docker compose down
```

# Database 

View database tables and content:
```bash
docker compose exec db psql -U ofs -d ofs
```

"ofs=" should appear.
For all relational database tables, type "\d" (press Enter to view more)
To see attributes of a table, type "\d {TABLE}" (ie \d users for users table)
To see contents of a table, use SQL (ie SELECT * FROM users for user data)

### Database tests (pgTAP)

The database image includes pgTAP and enables it automatically when a new
database volume is initialized. Start the database and run the schema tests:

```bash
docker compose up -d --build db
docker compose exec -e PGPASSWORD=ofs db pg_prove --dbname ofs --username ofs --host localhost /tests/schema.sql
```

The tests inspect the schema and starter data without changing application
records. The same command runs in the database CI job. Existing database
volumes do not rerun initialization scripts; enable pgTAP on one with:

```bash
docker compose exec db psql -U ofs -d ofs -c "CREATE EXTENSION IF NOT EXISTS pgtap;"
```

## Accounts and login

Customers sign up at http://localhost:5173/register. Manager accounts can't sign up on the site; create one from the command line while the stack is running:

```bash
docker compose exec backend npm run create-manager -- manager@ofs.com yourpassword First Last 408-555-0100
```

Then log in at http://localhost:5173/manager-login.
Managers land on the manager dashboard after signing in. The **Sales** tab includes revenue breakdown pies for the top items and categories, sales and gross-profit bar charts, and a range-filtered table of all catalog items with quantities, revenue, costs, profits, and stock.

### Managing products

The dashboard's **Inventory** tab lists every product, including deactivated ones (`/api/manager/inventory`, managers only). From there a manager can:

- **Add a product** with its name, description, category, unit, price, weight, and starting stock.
- **Record each product's unit cost**. Sales reports use the cost captured at checkout to calculate profit; orders placed before cost tracking was introduced are marked as unknown.
- **Edit a product**. Price changes are saved to `PriceHistory` with the manager who made them.
- **Deactivate or reactivate a product**. Deactivated products disappear from the store and can't be added to carts, but past orders that include them are kept.
- **Add or remove stock in bulk with a reason** ("Weekly delivery", "Spoiled"). Each change is saved to `Transactions` with the manager and the reason. The quick +/- controls on the catalog page save "Manual adjustment" as the reason.

Every add, edit, and (de)activation is also written to `AuditLog`. The backend adds the `PriceHistory.product_id` and `changed_by` columns at startup, so existing databases keep working without a reset (`db/init/006_inventory_management.sql` does the same for new ones).

## Cart and checkout

Customers' carts are saved in the database, so they persist across logins and devices. The API lives under `/api/cart` (`GET /`, `POST /items`, `PATCH /items/:productId`, `DELETE /items/:productId`) and only works for logged-in customers.

Checkout (`POST /api/orders`) turns the cart into an order with a delivery address. On future checkouts, the latest address used for one of that customer's orders is prefilled. It checks stock, takes the items out of inventory, and empties the cart in one transaction. Orders under 20 lbs ship free; 20 lbs or more adds a $10 fee. The card is charged through Stripe test mode. The order is saved only after Stripe confirms the payment, and the PaymentIntent id (`pi_…`) is stored on the payment as `transaction_reference`. Customers see their orders at http://localhost:5173/orders (`GET /api/orders/mine`).

### Stripe test mode

Create a `.env` file in the repo root (it is gitignored) with your test keys from the [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys) while **Test mode** is on:

```
STRIPE_SECRET_KEY=sk_test_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Restart the stack after saving it (`docker compose up --build`) so the backend and the checkout page both see the keys.

Card fields accept any future expiry, any 3-digit CVC, and any 5-digit ZIP. These two test cards cover the paths that matter:

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Expiry:  12/34
CVC:     123
ZIP:     95192
```

A successful card places the order and shows the payment in the Stripe test dashboard. The decline card shows an error and leaves the cart unchanged.

Products come from the database through `GET /api/products` (public, active products only). The inventory page's search, category filters, and item counts all work off that list, so stock goes down there after a purchase. Catalog tables and starter products are defined in `db/init/003_products.sql`. Postgres runs files in `db/init` only when it creates a new data volume. If an existing database is missing catalog or application tables, apply the relevant SQL files from `db/init` in order without deleting accounts.

These scripts are safe to reapply: they add missing schema objects and skip categories/products that already exist. The backend creates the global delivery settings table and default row and upgrades the inventory and item-cost columns at startup, so existing databases are upgraded without deleting data. Existing products start with no recorded cost; enter their unit costs in **Inventory** to include new orders in profit reporting. Historical orders without cost snapshots remain unknown. To apply the schemas manually, run `docker compose exec -T db psql -U ofs -d ofs < db/init/005_global_settings.sql` or `docker compose exec -T db psql -U ofs -d ofs < db/init/007_product_costs.sql`. To completely reset a local development database instead, use `docker compose down -v && docker compose up --build`; this deletes all database data, including accounts.

**Forgot password:** users answer the security question they picked at sign-up, then choose a new password. Manager accounts don't have a usable security answer; make a new manager account instead.

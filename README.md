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

## Accounts and login

Customers sign up at http://localhost:5173/register. Manager accounts can't sign up on the site; create one from the command line while the stack is running:

```bash
docker compose exec backend npm run create-manager -- manager@ofs.com yourpassword First Last 408-555-0100
```

Then log in at http://localhost:5173/manager-login.
Managers land on the manager dashboard after signing in. The dashboard shows an overview of the current product catalog and links to the catalog and customer storefront.

## Cart and checkout

Customers' carts are saved in the database, so they persist across logins and devices. The API lives under `/api/cart` (`GET /`, `POST /items`, `PATCH /items/:productId`, `DELETE /items/:productId`) and only works for logged-in customers.

Checkout (`POST /api/orders`) turns the cart into an order with a delivery address. It checks stock, takes the items out of inventory, and empties the cart in one transaction. Orders under 20 lbs ship free; 20 lbs or more adds a $10 fee. Payment is simulated: every order is marked paid. Customers see their orders at http://localhost:5173/orders (`GET /api/orders/mine`).

Products come from the database through `GET /api/products` (public, active products only). The inventory page's search, category filters, and item counts all work off that list, so stock goes down there after a purchase. Categories and the starter products are seeded by `db/init/003_products.sql`, which also adds `category_id` and `unit` columns to `Product`. If your database volume predates it, recreate it with `docker compose down -v && docker compose up --build` (this deletes existing accounts, so re-run `create-manager` afterwards).

**Forgot password:** users answer the security question they picked at sign-up, then choose a new password. Manager accounts don't have a usable security answer; make a new manager account instead.

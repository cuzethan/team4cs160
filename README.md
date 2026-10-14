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

# Database 

View database tables and content:
```bash
docker compose exec db psql -U ofs -d ofs
```

"ofs=" should appear.
For all relational database tables, type "\d" (press Enter to view more)
To see attributes of a table, type "\d {TABLE}" (ie \d users for users table)
To see contents of a table, use SQL (ie SELECT * FROM users for user data)

## Accounts and login

Customers sign up at http://localhost:5173/register. Manager accounts can't sign up on the site; create one from the command line while the stack is running:

```bash
docker compose exec backend npm run create-manager -- manager@ofs.com yourpassword First Last 408-555-0100
```

Then log in at http://localhost:5173/manager-login.
Managers land on the manager dashboard after signing in. The dashboard shows an overview of the current product catalog and links to the catalog and customer storefront.

## Cart and checkout

Customers' carts are saved in the database, so they persist across logins and devices. The API lives under `/api/cart` (`GET /`, `POST /items`, `PATCH /items/:productId`, `DELETE /items/:productId`) and only works for logged-in customers.

Checkout (`POST /api/orders`) turns the cart into an order with a delivery address. It checks stock, takes the items out of inventory, and empties the cart in one transaction. Orders under 20 lbs ship free; 20 lbs or more adds a $10 fee. The card is charged through Stripe test mode. The order is saved only after Stripe confirms the payment, and the PaymentIntent id (`pi_…`) is stored on the payment as `transaction_reference`. Customers see their orders at http://localhost:5173/orders (`GET /api/orders/mine`).

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

Products come from the database through `GET /api/products` (public, active products only). The inventory page's search, category filters, and item counts all work off that list, so stock goes down there after a purchase. Catalog tables and starter products are defined in `db/init/003_products.sql`. Postgres runs files in `db/init` only when it creates a new data volume. If an existing database is missing catalog or application tables, apply both migrations in order without deleting accounts

These scripts are safe to reapply: they add missing schema objects and skip categories/products that already exist. To completely reset a local development database instead, use `docker compose down -v && docker compose up --build`; this deletes all database data, including accounts.

**Forgot password:** users answer the security question they picked at sign-up, then choose a new password. Manager accounts don't have a usable security answer; make a new manager account instead.

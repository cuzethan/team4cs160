# OFS Delivery System User Guide

This guide explains how to set up the OFS Delivery System from a fresh checkout, start its Docker services, configure Stripe and Valhalla, create a manager account, and verify that the application is working.

## 1. Prerequisites

Install the following before starting:

- Git
- Docker Desktop with Docker Compose support
- An internet connection for downloading Docker images, the Valhalla map extract, geocoding results, and Stripe test-mode services

Make sure Docker Desktop is running before using any `docker compose` command.

## 2. Get the application

Clone the repository and change into its root directory:

```bash
git clone <repository-url>
cd team4cs160
```

All commands in this guide should be run from the directory containing `docker-compose.yml`.

## 3. Create the environment file

Create a file named `.env` in the repository root. This file is gitignored and should not be committed.

Add the following values:

```env
# Stripe test-mode keys
STRIPE_SECRET_KEY=sk_test_your_secret_key
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key

# Valhalla routing configuration
VALHALLA_TILE_URL=https://download.geofabrik.de/north-america/us/california/norcal-latest.osm.pbf
VALHALLA_URL=http://valhalla:8002
```

Get the Stripe keys from the [Stripe Dashboard test API keys page](https://dashboard.stripe.com/test/apikeys) while **Test mode** is enabled. Do not use live-mode keys in a local development environment, and do not share or commit the secret key.

The Stripe keys are required for checkout. The application can start without them, but payment attempts will fail until both keys are configured.

The Valhalla tile URL selects the OpenStreetMap extract used to build the routing graph. The included Northern California extract covers the default San Jose demo location.

## 4. Start the Docker services

Build the application images and start the complete stack:

```bash
docker compose up --build
```

This starts four services:

- `db` — PostgreSQL database
- `backend` — API and delivery simulator
- `frontend` — web application
- `valhalla` — road-network routing service

The command stays attached to the service logs. Press `Ctrl+C` to stop the stack.

The application is available at:

- Web app: <http://localhost:5173>
- API health check: <http://localhost:3001/health>
- Valhalla: <http://localhost:8002>

The health check should return a successful response after the backend and database have started.

## 5. Wait for Valhalla to finish initializing

On its first start, Valhalla downloads the configured map extract and builds graph tiles. This can take several minutes and requires available disk space.

## 6. Create a manager account

Leave the Docker stack running and open a second terminal in the repository root. Create a manager account with:

```bash
docker compose exec backend npm run create-manager -- manager@ofs.com manager123 Max Boss 408-555-0100
```

The command format is:

```text
docker compose exec backend npm run create-manager -- <email> <password> [first-name] [last-name] [phone]
```

The password must contain at least eight characters. Manager accounts cannot be created through the website. If the email address already exists, run the command again with a different email address.

After the command reports that the account was created, open:

<http://localhost:5173/manager-login>

Sign in with the manager email and password.

## 7. Create a customer account

Customers register through the website:

<http://localhost:5173/register>

After registering, sign in as the customer, browse the catalog, add products to the cart, and proceed to checkout.

## 8. Ports and port conflicts

The default host ports are:

| Service | Default port |
| --- | ---: |
| Frontend | `5173` |
| Backend API | `3001` |
| PostgreSQL | `5432` |
| Valhalla | `8002` |

If PostgreSQL or the backend API port is already in use, override those host ports when starting the stack:

```bash
DB_PORT=5433 API_PORT=3002 docker compose up --build
```

With this configuration, use:

- Web app: <http://localhost:5173>
- API health check: <http://localhost:3002/health>
- PostgreSQL: `localhost:5433`

The frontend and Valhalla ports are fixed by the current Compose file. To change those ports, edit `docker-compose.yml`.

## 9. Database access and persistence

PostgreSQL uses these local development credentials:

```text
Host:     localhost
Port:     5432
User:     ofs
Password: ofs
Database: ofs
```

Open a PostgreSQL shell inside the database container with:

```bash
docker compose exec db psql -U ofs -d ofs
```

Useful commands inside `psql` include:

```sql
\d
\d users
SELECT * FROM users;
```

The database is stored in the Docker volume named `pgdata`. Stopping the containers does not delete this data.

To stop the application while preserving the database volume:

```bash
docker compose down
```

The database initialization scripts run automatically when a new database volume is created. The backend also applies several additive schema upgrades at startup, so normal upgrades do not require deleting the database.

## 10. Reset a local development database

To completely reset the local development database and recreate it from the initialization scripts:

```bash
docker compose down -v
docker compose up --build
```

This permanently removes local database data, including customer accounts, manager accounts, orders, inventory changes, and delivery history. Use it only when a clean local database is intended.

## 11. Reset active robots

To stop active delivery runs, return robots to the configured base, and make undelivered orders available for dispatch again:

```bash
docker compose stop backend
docker compose run --rm backend npm run reset-robots
docker compose start backend
```

Stop the backend first so the delivery simulator does not update robot positions while the reset is running. Completed deliveries are preserved.

## 12. Troubleshooting

### Docker commands fail immediately

Start Docker Desktop and wait until it reports that Docker is running. Then retry the Compose command.

### A port is already in use

Use the `DB_PORT` and `API_PORT` overrides described above. If port `5173` or `8002` is occupied, stop the process using that port or update the corresponding port mapping in `docker-compose.yml`.

### Valhalla is still unavailable

Check its logs:

```bash
docker compose logs --tail=100 valhalla
```

The first initialization is the slowest because the map extract must be downloaded and converted into routing tiles. Confirm that the machine has internet access and enough disk space.

### Checkout reports that payments are not configured

Check that `.env` contains both Stripe values, that the keys begin with `sk_test_` and `pk_test_`, and that the stack was restarted after editing `.env`:

```bash
docker compose up --build
```

### The manager account cannot be created

Confirm that the backend is running and that the password has at least eight characters. If the email is already registered, use another email address.

### The API is not healthy

Check the backend logs:

```bash
docker compose logs --tail=100 backend
```

Then check the API directly:

```bash
curl http://localhost:3001/health
```

If you started the stack with `API_PORT=3002`, use port `3002` in the URL.

### The application is using stale or incomplete data

First restart the stack without deleting volumes:

```bash
docker compose down
docker compose up --build
```

Only use `docker compose down -v` if you intentionally want to erase and recreate the local database.

## 13. Stop the application

For a normal shutdown that preserves local database data:

```bash
docker compose down
```

Start it again later with:

```bash
docker compose up --build
```



### Team 4 - OFS Delivery System

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

**Forgot password:** users answer the security question they picked at sign-up, then choose a new password. Manager accounts don't have a usable security answer; make a new manager account instead.

**After pulling this change:** the login tables are new, so reset your local database once (this deletes local data):

```bash
docker compose down -v && docker compose up --build
```

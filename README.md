### Team 4 - OFS Delivery System

## Start

Docker Desktop needs to be running.

From the repo root:

```bash
docker compose up --build
```

Then open:

- Site: http://localhost:5173
- API health: http://localhost:3001/health
- Postgres: `localhost:5432` (user `ofs`, password `ofs`, database `ofs`)

Stop the stack with:

```bash
docker compose down
```

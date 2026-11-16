# UNViMe backend

Express 5 + PostgreSQL chess backend. Stage 0 skeleton: config, error handling and `/health`.

## Requirements

- Node 22+ (`.nvmrc` pins 24)
- pnpm 10 via Corepack

## Setup

```sh
corepack enable
pnpm --dir backend install
cp backend/.env.example backend/.env
pnpm --dir backend dev
```

## Tests

```sh
pnpm --dir backend test
```

Tests do not need a database.

## Verify

```sh
curl.exe http://127.0.0.1:3001/health
```

Expected: HTTP 200 with `{"status":"ok","db":"up"|"down",...}`. The endpoint always returns 200; `db` reflects PostgreSQL reachability.

## Database

The DB scripts (`db/init.sql`, `db/schema.sql`, seeds) come from the Data Modeling team and are not part of this skeleton.

# Prisma migrations with Supabase (pooler vs direct)

When using Supabase (or any Postgres behind a connection pooler like pgbouncer), Prisma Migrate must connect to the database via a DIRECT connection, not the pooler.

This project is configured accordingly in `prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")     // app/runtime (can point to pooler)
  directUrl = env("DIRECT_URL")       // migrations (must point to direct host)
}
```

## .env variables

Add both variables in `server/.env`:

```ini
# Pooler (good for runtime)
DATABASE_URL="postgresql://<user>:<pass>@<project-id>.pooler.supabase.com:5432/postgres?sslmode=require"

# Direct (required for prisma migrate, studio, db push)
DIRECT_URL="postgresql://<user>:<pass>@db.<project-id>.supabase.co:5432/postgres?sslmode=require"
```

Notes:
- Replace `<project-id>` and credentials with your actual values from the Supabase dashboard.
- Keep `sslmode=require` in both URLs.
- If you only have one host, you can temporarily set both to the same direct URL while migrating.

## Commands

From the `server` directory:

```bash
npx prisma generate
npx prisma migrate dev -n add_ride_events
```

If you hit P1001 (can’t reach database), check:

- You are on a network that can reach Supabase.
- Credentials are correct.
- You are using the DIRECT host in `DIRECT_URL`.
- Supabase project is running and not paused.

You can also push schema without creating a migration (useful for quick sync in dev):

```bash
npx prisma db push
```

If your DATABASE_URL points at a pooler and you run into errors with Prisma Studio or migrations, switch to using the `DIRECT_URL` temporarily.

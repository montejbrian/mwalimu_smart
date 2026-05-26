# PostgreSQL Setup Guide

## Quick Start - Getting PostgreSQL Running

### Linux (Ubuntu/Debian)

```bash
# Start PostgreSQL service
sudo systemctl start postgresql

# Verify it's running
sudo systemctl status postgresql

# (Optional) Enable auto-start on boot
sudo systemctl enable postgresql
```

### Access PostgreSQL

```bash
# Switch to postgres user and connect
sudo -u postgres psql

# Or connect directly (if your user has login rights)
psql -U postgres -h localhost
```

### Create Database and User

Once connected to PostgreSQL (`psql` prompt):

```sql
-- Create the database
CREATE DATABASE mwalimu_smart;

-- Create user (if needed)
CREATE USER postgres WITH PASSWORD 'postgres';

-- Grant privileges
ALTER ROLE postgres WITH SUPERUSER CREATEDB CREATEROLE LOGIN;

-- Connect to the new database
\c mwalimu_smart

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify extension is enabled
\dx

-- Exit
\q
```

### Alternative: Using Docker (Easiest)

```bash
# Install Docker if needed, then run:
docker run --name mwalimu-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=mwalimu_smart \
  -p 5432:5432 \
  -d postgres:18-alpine

# Verify it's running
docker ps | grep mwalimu-postgres
```

## Testing Connection

```bash
# Test connection
psql -U postgres -h localhost -d mwalimu_smart -c "SELECT version();"

# If this works, your PostgreSQL is ready!
```

## Connection String

For the backend, this should be automatically used:
```
postgres://postgres:postgres@localhost:5432/mwalimu_smart
```

## Troubleshooting

### "Connection refused"
- PostgreSQL is not running - start it with `sudo systemctl start postgresql`

### "Authentication failed"
- Check PostgreSQL is listening: `sudo netstat -tlnp | grep postgres`
- Verify credentials in `.env` file

### "Database 'mwalimu_smart' does not exist"
- The backend will create it automatically on first run
- Or create manually with `CREATE DATABASE mwalimu_smart;`

### "pgvector extension not found"
```bash
# Install pgvector on your system
sudo apt-get install postgresql-18-pgvector
# Then restart PostgreSQL
sudo systemctl restart postgresql
```

## Next Steps

Once PostgreSQL is running:

1. Go back to backend directory
2. Run `npm run dev`
3. You should see: "✓ Database initialized successfully"

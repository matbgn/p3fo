#!/usr/bin/env bash
# shellcheck disable=SC2086,SC2048
set -e

echo "--- P3FO Container Start ---"

# Set up environment
export NODE_ENV=production
export PORT=${PORT:-5173}

# Set database configuration (default to SQLite in data directory)
export P3FO_DB_CLIENT=${P3FO_DB_CLIENT:-sqlite}
export P3FO_DB_SQLITE_FILE=${P3FO_DB_SQLITE_FILE:-/home/appuser/data/p3fo.db}

echo "Starting P3FO server..."
echo "Database: $P3FO_DB_CLIENT"
if [ "$P3FO_DB_CLIENT" = "sqlite" ]; then
    echo "SQLite file: $P3FO_DB_SQLITE_FILE"
fi
echo "Port: $PORT"

# Start the server (it will serve both API and static files)
exec node dist/server/server/index.js

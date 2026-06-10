#!/bin/sh
# Ежедневный дамп БД с хранением 30 дней (Н3).
set -e
STAMP=$(date +%Y%m%d_%H%M%S)
pg_dump -h db -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "/backups/mikofai_$STAMP.sql.gz"
find /backups -name "mikofai_*.sql.gz" -mtime +30 -delete
echo "backup done: mikofai_$STAMP.sql.gz"

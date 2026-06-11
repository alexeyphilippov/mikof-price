#!/bin/sh
# Периодически проверяет доступность сервисов и пишет результат в общий лог,
# который собирает Fluent Bit → Loki → Grafana (алерт по доступности, Н5).
LOG=/logs/health.log
INTERVAL="${INTERVAL:-30}"
while true; do
  for pair in "backend http://backend:8000/api/health" "mailer http://mailer:8001/health" "frontend http://frontend:5173/"; do
    name=$(echo "$pair" | cut -d' ' -f1)
    url=$(echo "$pair" | cut -d' ' -f2)
    if wget -q -T 5 --header "Host: mikofai.ru" -O /dev/null "$url"; then st=up; else st=down; fi
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) healthcheck service=$name status=$st" >> "$LOG"
  done
  sleep "$INTERVAL"
done

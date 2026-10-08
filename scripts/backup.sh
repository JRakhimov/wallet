#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
temporary="$(mktemp "backups/wallet-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
trap 'rm -f "$temporary"' EXIT
docker compose exec -T db pg_dump -U wallet -d wallet -Fc > "$temporary"
if ! docker compose exec -T db pg_restore --list < "$temporary" > /dev/null; then
  printf 'Backup validation failed\n' >&2
  exit 1
fi
destination="$temporary.dump"
mv "$temporary" "$destination"
trap - EXIT
printf '%s\n' "$destination"

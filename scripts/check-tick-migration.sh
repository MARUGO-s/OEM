#!/usr/bin/env bash
# Local-only check of supabase/migrations/20260930000100_kotonoha_background_tick.sql.
# Starts a throwaway PostgreSQL (needs postgresql + postgresql-<ver>-cron installed) under /tmp,
# with stub vault/net schemas. Never connects to Supabase. Usage: bash scripts/check-tick-migration.sh
set -euo pipefail
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
DIR="$(mktemp -d)"; PORT="${PG_PORT:-55432}"
M="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations/20260930000100_kotonoha_background_tick.sql"
trap '"$BIN/pg_ctl" -D "$DIR/data" -w stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
printf "shared_preload_libraries='pg_cron'\ncron.database_name='postgres'\nport=%s\nunix_socket_directories='%s'\n" "$PORT" "$DIR" >>"$DIR/data/postgresql.conf"
"$BIN/pg_ctl" -D "$DIR/data" -l "$DIR/log" -w start >/dev/null
P=(psql -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -qAt)
q() { "${P[@]}" -c "$1"; }
check() { [[ "$(q "$1")" == "$2" ]] || { echo "FAIL: $1 -> $(q "$1") (expected $2)"; exit 1; }; echo "ok: $3"; }
q "create role anon; create role authenticated; create role service_role; create schema kotonoha;
   create table kotonoha.access_config (singleton boolean primary key default true, workspace_id uuid not null default gen_random_uuid());
   insert into kotonoha.access_config default values;"
"${P[@]}" -f "$M" 2>&1 | grep -q "pg_cron is not enabled"
echo "ok: applies without pg_cron/pg_net/Vault (notice only)"
check "select public.kotonoha_tick('workspace')->>'workspaceId' = (select workspace_id::text from kotonoha.access_config)" t "workspace RPC"
check "select has_function_privilege('anon','public.kotonoha_tick(text,jsonb)','execute') or has_function_privilege('authenticated','public.kotonoha_tick(text,jsonb)','execute')" f "RPC not callable by anon/authenticated"
check "select has_function_privilege('service_role','public.kotonoha_tick(text,jsonb)','execute')" t "RPC callable by service_role"
check "select kotonoha.tick_request() is null" t "no-op without pg_net/Vault"
q "create extension pg_cron"
"${P[@]}" -f "$M" >/dev/null 2>&1; "${P[@]}" -f "$M" >/dev/null 2>&1
check "select count(*)||'|'||min(schedule)||'|'||min(command) from cron.job where jobname='kotonoha-tick'" "1|* * * * *|select kotonoha.tick_request()" "scheduled once, idempotent re-apply"
q "create schema vault; create table vault.decrypted_secrets(name text, decrypted_secret text);
   create schema net; create table net.calls(url text, headers jsonb);
   create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
   returns bigint language sql as \$\$ insert into net.calls values (url, headers) returning 1::bigint \$\$;"
check "select kotonoha.tick_request() is null" t "no-op without Vault entries"
q "insert into vault.decrypted_secrets values ('kotonoha_tick_url','https://example.invalid/functions/v1/kotonoha-api/internal/tick'),('kotonoha_tick_secret','short')"
check "select kotonoha.tick_request() is null" t "short secret refused"
q "update vault.decrypted_secrets set decrypted_secret=repeat('s',48) where name='kotonoha_tick_secret'"
check "select kotonoha.tick_request()" 1 "posts when configured"
check "select url||'|'||(headers->>'x-kotonoha-tick' = repeat('s',48)) from net.calls" "https://example.invalid/functions/v1/kotonoha-api/internal/tick|true" "URL and secret header from Vault"
echo "all tick migration checks passed"

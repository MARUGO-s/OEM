#!/usr/bin/env bash
# Local-only check of supabase/migrations/20260930000200_kotonoha_meet_bot.sql.
# Starts a throwaway PostgreSQL under /tmp, applies the base kotonoha migration (with a stub
# storage schema) and the bot migration, then exercises every kotonoha_bot operation.
# Never connects to Supabase. Usage: bash scripts/check-bot-migration.sh
set -euo pipefail
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
DIR="$(mktemp -d)"; PORT="${PG_PORT:-55433}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"
trap '"$BIN/pg_ctl" -D "$DIR/data" -w stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
printf "port=%s\nunix_socket_directories='%s'\n" "$PORT" "$DIR" >>"$DIR/data/postgresql.conf"
"$BIN/pg_ctl" -D "$DIR/data" -l "$DIR/log" -w start >/dev/null
P=(psql -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -qAt)
q() { "${P[@]}" -c "$1"; }
check() { local got; got="$(q "$1")"; [[ "$got" == "$2" ]] || { echo "FAIL: $3: $1 -> $got (expected $2)"; exit 1; }; echo "ok: $3"; }
fails() { if q "$1" >/dev/null 2>"$DIR/err"; then echo "FAIL: $3 (no error)"; exit 1; fi
  grep -q "$2" "$DIR/err" || { echo "FAIL: $3: $(cat "$DIR/err")"; exit 1; }; echo "ok: $3"; }
q "create role anon; create role authenticated; create role service_role;
   create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);"
"${P[@]}" -f "$ROOT/20260923000100_create_kotonoha_isolated_workspace.sql" >/dev/null
"${P[@]}" -f "$ROOT/20260930000200_kotonoha_meet_bot.sql" >/dev/null
echo "ok: applies on top of the base kotonoha schema"

O=00000000-0000-4000-8000-000000000001; M=00000000-0000-4000-8000-0000000000a1; R=00000000-0000-4000-8000-0000000000b1
H=$(printf 'a%.0s' {1..64})
doc() { # $1 meeting id, $2 request id, $3 expiry interval
  echo "jsonb_build_object('status','bot','title','定例','date','2026-09-30','participants','','template','standard','audioParts','[]'::jsonb,
    'attachments','[]'::jsonb,'bot',jsonb_build_object('requestId','$2','meetUrl','https://meet.google.com/abc-defg-hij','state','waiting',
    'expiresAt',to_char((now()+interval '$3') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')))"
}
check "select has_function_privilege('anon','public.kotonoha_bot(text,uuid,uuid,jsonb)','execute') or has_function_privilege('authenticated','public.kotonoha_bot(text,uuid,uuid,jsonb)','execute')" f "RPC not callable by anon/authenticated"
check "select has_function_privilege('service_role','public.kotonoha_bot(text,uuid,uuid,jsonb)','execute')" t "RPC callable by service_role"
check "select has_table_privilege('authenticated','kotonoha.bot_requests','select')" f "table not readable by clients"
check "select public.kotonoha_bot('create','$O','$M',jsonb_build_object('tokenHash','$H','document',$(doc $M $R '6 hours')))->'document'->>'status'" bot "create pre-creates the meeting (status bot)"
check "select token_hash = '$H' and expires_at <= now() + interval '6 hours 5 minutes' and meet_url='https://meet.google.com/abc-defg-hij' from kotonoha.bot_requests" t "only the hash is stored, expiry ~6h"
check "select public.kotonoha_bot('auth',null,null,'{\"tokenHash\":\"$H\"}')->>'meetingId'" "$M" "token authenticates for its meeting"
check "select public.kotonoha_bot('auth',null,null,'{\"tokenHash\":\"$(printf 'b%.0s' {1..64})\"}')->>'error'" INVALID_TOKEN "unknown token rejected"
check "select public.kotonoha_bot('auth',null,null,'{\"tokenHash\":\"nothex\"}')->>'error'" INVALID_TOKEN "malformed hash rejected"
check "select public.kotonoha_bot('status','$O','$M','{\"state\":\"recording\",\"message\":\"録音開始\"}')->'document'->'bot'->>'state'" recording "status update"
fails "select public.kotonoha_bot('status','$O','$M','{\"state\":\"done\"}')" INVALID_OPERATION "unknown bot state rejected"
fails "select public.kotonoha_bot('status','00000000-0000-4000-8000-000000000009','$M','{\"state\":\"recording\"}')" NOT_FOUND "other workspace cannot touch the meeting"
q "update kotonoha.meetings set document = document || '{\"attachments\":[{\"id\":\"00000000-0000-4000-8000-0000000000c1\",\"name\":\"a.pdf\",\"size\":10,\"storagePath\":\"x\"}]}' where id='$M'"
check "select (r->'document'->>'status')||'|'||(r->'document'->'bot'->>'state')||'|'||jsonb_array_length(r->'document'->'uploadPlan')||'|'||(r->'document'->'attachmentPlan'->0->>'name')||'|'||jsonb_array_length(r->'document'->'attachments')||'|'||(r->'document'->>'title')
  from public.kotonoha_bot('plan','$O','$M','{\"document\":{\"status\":\"uploading\",\"title\":\"定例\",\"uploadPlan\":[{\"name\":\"recording-1-1.ogg\"}],\"audioParts\":[],\"attachments\":[],\"attachmentPlan\":[],\"chunked\":true}}') r" \
  "uploading|uploading|1|a.pdf|1|定例" "plan: bot -> uploading, keeps attachments added while waiting"
check "select public.kotonoha_bot('plan','$O','$M','{\"document\":{\"uploadPlan\":[{\"name\":\"recording-1-1.ogg\"},{\"name\":\"recording-1-2.ogg\"}],\"audioParts\":[]}}')->'document'->'uploadPlan'->1->>'name'" recording-1-2.ogg "plan retry allowed before any part"
q "update kotonoha.meetings set document = jsonb_set(document,'{audioParts}','[{\"name\":\"p\"}]') where id='$M'"
fails "select public.kotonoha_bot('plan','$O','$M','{\"document\":{}}')" UPLOAD_ORDER "plan refused after a part was committed"
check "select public.kotonoha_bot('auth',null,null,'{\"tokenHash\":\"$H\"}')->>'meetingId'" "$M" "token still valid while uploading"
q "update kotonoha.meetings set document = document || '{\"status\":\"transcribing\"}' where id='$M'"
check "select public.kotonoha_bot('auth',null,null,'{\"tokenHash\":\"$H\"}')->>'error'" INVALID_TOKEN "token unusable once processing started"
fails "select public.kotonoha_bot('status','$O','$M','{\"state\":\"error\"}')" BOT_CLOSED "status refused after complete"
check "select (public.kotonoha_bot('revoke','$O','$M')->'document'->'bot'->>'completedAt') is not null" t "revoke records completedAt"
check "select used_at is not null from kotonoha.bot_requests where meeting_id='$M'" t "revoke marks the token used"
q "update kotonoha.meetings set document = document || '{\"status\":\"uploading\"}' where id='$M'"
check "select public.kotonoha_bot('auth',null,null,'{\"tokenHash\":\"$H\"}')->>'error'" INVALID_TOKEN "revoked token stays invalid"

# expiry, discard, limits
M2=00000000-0000-4000-8000-0000000000a2; H2=$(printf 'c%.0s' {1..64})
q "select public.kotonoha_bot('create','$O','$M2',jsonb_build_object('tokenHash','$H2','document',$(doc $M2 00000000-0000-4000-8000-0000000000b2 '6 hours')))" >/dev/null
q "update kotonoha.bot_requests set expires_at = now() - interval '1 second' where meeting_id='$M2'"
check "select public.kotonoha_bot('auth',null,null,'{\"tokenHash\":\"$H2\"}')->>'error'" INVALID_TOKEN "expired token rejected"
check "select public.kotonoha_bot('discard','$O','$M2')->>'deleted'" true "discard removes the placeholder"
check "select deleted_at is not null from kotonoha.meetings where id='$M2'" t "discarded meeting is soft-deleted"
fails "select public.kotonoha_bot('create','$O','$M2',jsonb_build_object('tokenHash','$H2','document',$(doc $M2 00000000-0000-4000-8000-0000000000b9 '6 hours')))" "duplicate key" "meeting id cannot be reused"
check "select public.kotonoha_bot('create','$O','00000000-0000-4000-8000-0000000000a3',jsonb_build_object('tokenHash','$(printf 'd%.0s' {1..64})','document',$(doc 00000000-0000-4000-8000-0000000000a3 00000000-0000-4000-8000-0000000000b3 '30 days')))->'document'->>'status'" bot "create with a far expiry"
check "select expires_at <= now() + interval '6 hours 5 minutes' from kotonoha.bot_requests where meeting_id='00000000-0000-4000-8000-0000000000a3'" t "expiry is capped at ~6h server-side"
for i in 4 5 6 7; do
  q "select public.kotonoha_bot('create','$O','00000000-0000-4000-8000-0000000000a$i',jsonb_build_object('tokenHash','$(printf "$i%.0s" {1..64})','document',$(doc 00000000-0000-4000-8000-0000000000a$i 00000000-0000-4000-8000-0000000000b$i '6 hours')))" >/dev/null
done
fails "select public.kotonoha_bot('create','$O','00000000-0000-4000-8000-0000000000a8',jsonb_build_object('tokenHash','$(printf 'e%.0s' {1..64})','document',$(doc 00000000-0000-4000-8000-0000000000a8 00000000-0000-4000-8000-0000000000b8 '6 hours')))" BOT_LIMIT "at most 5 meetings waiting for the bot"
fails "select public.kotonoha_bot('create','$O','00000000-0000-4000-8000-0000000000a9','{\"tokenHash\":\"$H\",\"document\":{\"status\":\"uploading\"}}')" INVALID_OPERATION "create requires a bot document"
fails "select public.kotonoha_bot('status','$O','00000000-0000-4000-8000-000000000fff','{\"state\":\"recording\"}')" NOT_FOUND "unknown meeting"
echo "all bot migration checks passed"

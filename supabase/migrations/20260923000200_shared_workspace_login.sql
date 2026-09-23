-- Only kotonoha-owned objects change. Supabase Auth and other apps stay intact.
create table kotonoha.access_config (
  singleton boolean primary key default true check (singleton),
  login_id text not null default 'marugo',
  password_hash text,
  workspace_id uuid not null default gen_random_uuid()
);
insert into kotonoha.access_config(singleton) values (true);
create table kotonoha.sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index kotonoha_sessions_expiry on kotonoha.sessions(expires_at);
create table kotonoha.login_attempts (
  key text primary key,
  failures integer not null default 0,
  window_start timestamptz not null default now()
);
alter table kotonoha.access_config enable row level security;
alter table kotonoha.sessions enable row level security;
alter table kotonoha.login_attempts enable row level security;
revoke all on kotonoha.access_config, kotonoha.sessions, kotonoha.login_attempts from public, anon, authenticated;

-- Migrate any existing meeting records, including recoverable deleted records.
-- Keep audio paths unchanged. Personal API keys are not repurposed for sharing.
do $migration$
begin
  if exists (select 1 from kotonoha.meetings where deleted_at is null
    and document->>'status' in ('transcribing','analyzing')) then
    raise exception 'Finish or recover active kotonoha jobs before switching workspaces';
  end if;
  update kotonoha.meetings set owner_id = (select workspace_id from kotonoha.access_config), updated_at = now();
end;
$migration$;

create function public.kotonoha_auth(p_operation text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_config kotonoha.access_config%rowtype;
  v_token text := p_payload->>'tokenHash';
  v_ip text := p_payload->>'ipHash';
  v_expiry timestamptz;
  v_password text := p_payload->>'password';
begin
  select * into strict v_config from kotonoha.access_config where singleton;
  if v_token is null or v_token !~ '^[0-9a-f]{64}$' then return '{"error":"INVALID_TOKEN"}'::jsonb; end if;
  if p_operation = 'login' then
    if v_config.password_hash is null then return '{"error":"NOT_CONFIGURED"}'::jsonb; end if;
    if v_ip is null or v_ip !~ '^[0-9a-f]{64}$' then return '{"error":"INVALID_INPUT"}'::jsonb; end if;
    perform pg_advisory_xact_lock(hashtextextended('kotonoha-shared-login', 1478));
    delete from kotonoha.login_attempts where window_start < now() - interval '15 minutes';
    delete from kotonoha.sessions where expires_at <= now();
    if exists (select 1 from kotonoha.login_attempts where
      (key = 'ip:' || v_ip and failures >= 10) or (key = 'global' and failures >= 100)) then
      return '{"error":"RATE_LIMIT"}'::jsonb;
    end if;
    if v_password is null or octet_length(v_password) > 72 or length(v_password) = 0
      or p_payload->>'loginId' is distinct from v_config.login_id
      or extensions.crypt(v_password, v_config.password_hash) is distinct from v_config.password_hash then
      insert into kotonoha.login_attempts(key, failures) values ('ip:' || v_ip, 1), ('global', 1)
      on conflict (key) do update set failures = kotonoha.login_attempts.failures + 1;
      -- Return, do not raise: failed-attempt counters must commit.
      return '{"error":"INVALID_CREDENTIALS"}'::jsonb;
    end if;
    delete from kotonoha.login_attempts where key = 'ip:' || v_ip;
    v_expiry := now() + interval '12 hours';
    insert into kotonoha.sessions(token_hash, expires_at) values (v_token, v_expiry);
    return jsonb_build_object('workspaceId', v_config.workspace_id, 'expiresAt', v_expiry);
  elsif p_operation = 'session' then
    select expires_at into v_expiry from kotonoha.sessions where token_hash = v_token and expires_at > now();
    if not found then return '{"error":"INVALID_TOKEN"}'::jsonb; end if;
    return jsonb_build_object('workspaceId', v_config.workspace_id, 'expiresAt', v_expiry);
  elsif p_operation = 'logout' then
    delete from kotonoha.sessions where token_hash = v_token;
    return '{"ok":true}'::jsonb;
  end if;
  return '{"error":"INVALID_OPERATION"}'::jsonb;
end;
$function$;
revoke all on function public.kotonoha_auth(text,jsonb) from public, anon, authenticated;
grant execute on function public.kotonoha_auth(text,jsonb) to service_role;

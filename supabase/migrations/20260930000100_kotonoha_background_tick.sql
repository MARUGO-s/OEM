-- Background progression for kotonoha (no client needs to keep the app open).
-- Additive and kotonoha-only: one service_role RPC, one private helper in the kotonoha schema,
-- and (only if pg_cron is already enabled) one cron job named 'kotonoha-tick'.
-- No other app's tables, functions, Auth, Storage policies or extensions are changed.
-- Secrets are never stored here: the function URL and tick secret are read from Supabase Vault
-- ('kotonoha_tick_url', 'kotonoha_tick_secret') at run time. Missing extensions or Vault entries
-- make the job a no-op instead of failing. See DEPLOYMENT.md for the one-time setup.

-- The Edge Function needs the shared workspace id without a user session.
create or replace function public.kotonoha_tick(p_operation text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_workspace uuid;
begin
  if p_operation = 'workspace' then
    select workspace_id into v_workspace from kotonoha.access_config where singleton;
    return jsonb_build_object('workspaceId', v_workspace);
  end if;
  raise exception 'INVALID_OPERATION' using errcode = '22023';
end $$;
revoke all on function public.kotonoha_tick(text,jsonb) from public, anon, authenticated;
grant execute on function public.kotonoha_tick(text,jsonb) to service_role;

-- Called every minute by pg_cron. Fire-and-forget HTTP POST via pg_net; returns the request id
-- or null when pg_net / Vault / the secrets are not available yet.
create or replace function kotonoha.tick_request()
returns bigint language plpgsql set search_path = '' as $$
declare
  v_url text;
  v_secret text;
  v_request bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return null;
  end if;
  execute $q$select max(decrypted_secret) filter (where name = 'kotonoha_tick_url'),
                    max(decrypted_secret) filter (where name = 'kotonoha_tick_secret')
             from vault.decrypted_secrets
             where name in ('kotonoha_tick_url', 'kotonoha_tick_secret')$q$
    into v_url, v_secret;
  if coalesce(v_url, '') = '' or coalesce(length(v_secret), 0) < 32 then
    return null;
  end if;
  execute $q$select net.http_post(
      url := $1,
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-kotonoha-tick', $2),
      timeout_milliseconds := 30000)$q$
    into v_request using v_url, v_secret;
  return v_request;
end $$;
revoke all on function kotonoha.tick_request() from public, anon, authenticated;

-- Schedule only when pg_cron exists. Re-running this block is idempotent.
do $schedule$
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron is not enabled: kotonoha-tick was not scheduled. See DEPLOYMENT.md.';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'kotonoha-tick') then
    perform cron.unschedule('kotonoha-tick');
  end if;
  perform cron.schedule('kotonoha-tick', '* * * * *', 'select kotonoha.tick_request()');
  if to_regnamespace('net') is null then
    raise notice 'pg_net is not enabled: kotonoha-tick runs as a no-op until it is. See DEPLOYMENT.md.';
  end if;
end
$schedule$;

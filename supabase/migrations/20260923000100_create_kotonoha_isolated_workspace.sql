-- Additive only. Do not run unrelated OEM/Recipe-Management migrations.
-- This private schema is deliberately not exposed through PostgREST.
create schema kotonoha;
revoke all on schema kotonoha from public, anon, authenticated;

create table kotonoha.meetings (
  id uuid primary key,
  owner_id uuid not null,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  audio_path text,
  response_id text,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table kotonoha.meetings is 'Kotonoha-only records. No FK or trigger to existing application tables.';
create index kotonoha_meetings_owner_created on kotonoha.meetings(owner_id, created_at desc) where deleted_at is null;
create table kotonoha.settings (
  owner_id uuid primary key,
  model text not null default 'gpt-6-astra' check (model in ('gpt-6-astra', 'gpt-6-sol')),
  encrypted_key text,
  updated_at timestamptz not null default now()
);
alter table kotonoha.meetings enable row level security;
alter table kotonoha.settings enable row level security;
revoke all on all tables in schema kotonoha from public, anon, authenticated;
alter default privileges in schema kotonoha revoke all on tables from public, anon, authenticated;

-- Only the Edge Function can invoke this RPC. It verifies the user's JWT before
-- supplying p_owner; client roles cannot invoke it or access the private tables.
create function public.kotonoha_store(
  p_operation text, p_owner uuid, p_id uuid default null, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_row kotonoha.meetings%rowtype;
  v_result jsonb;
  v_count integer;
begin
  if p_owner is null then raise exception 'OWNER_REQUIRED' using errcode = '22023'; end if;
  if p_operation = 'settings_get' then
    select jsonb_build_object('model', model, 'encryptedKey', encrypted_key)
      into v_result from kotonoha.settings where owner_id = p_owner;
    return coalesce(v_result, '{"model":"gpt-6-astra","encryptedKey":null}'::jsonb);
  elsif p_operation = 'settings_put' then
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 1477));
    if p_payload ? 'encryptedKey' and exists (
      select 1 from kotonoha.meetings where owner_id = p_owner and deleted_at is null
      and document->>'status' in ('transcribing','analyzing')
    ) then raise exception 'BUSY'; end if;
    insert into kotonoha.settings(owner_id, model, encrypted_key)
      values (p_owner, p_payload->>'model', p_payload->>'encryptedKey')
      on conflict (owner_id) do update set model = excluded.model,
        encrypted_key = case when p_payload ? 'encryptedKey' then excluded.encrypted_key else kotonoha.settings.encrypted_key end,
        updated_at = now();
    return public.kotonoha_store('settings_get', p_owner);
  elsif p_operation = 'list' then
    select coalesce(jsonb_agg(jsonb_build_object('document', document, 'audioPath', audio_path,
      'responseId', response_id, 'leaseUntil', lease_until, 'updatedAt', updated_at) order by created_at desc), '[]'::jsonb)
      into v_result from kotonoha.meetings where owner_id = p_owner and deleted_at is null;
    return v_result;
  elsif p_operation = 'create' then
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 1477));
    if (p_payload->'document'->>'isDemo')::boolean then
      select * into v_row from kotonoha.meetings where owner_id = p_owner and deleted_at is null
        and document->>'isDemo' = 'true' limit 1;
      if found then return public.kotonoha_store('get', p_owner, v_row.id); end if;
    else
      select count(*) into v_count from kotonoha.meetings where owner_id = p_owner and deleted_at is null
        and document->>'status' in ('transcribing','analyzing') and lease_until > now();
      if v_count >= 2 then raise exception 'CONCURRENCY_LIMIT'; end if;
    end if;
    select count(*) into v_count from kotonoha.meetings where owner_id = p_owner and deleted_at is null;
    if v_count >= 1000 then raise exception 'MEETING_LIMIT'; end if;
    insert into kotonoha.meetings(id, owner_id, document, audio_path, lease_until)
      values (p_id, p_owner, (p_payload->'document') || jsonb_build_object('id', p_id),
        p_payload->>'audioPath', now() + interval '4 minutes');
    return public.kotonoha_store('get', p_owner, p_id);
  end if;
  if p_operation = 'claim' then
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 1477));
  end if;
  select * into v_row from kotonoha.meetings where id = p_id and owner_id = p_owner and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if p_operation = 'get' then
    return jsonb_build_object('document', v_row.document, 'audioPath', v_row.audio_path,
      'responseId', v_row.response_id, 'leaseUntil', v_row.lease_until, 'updatedAt', v_row.updated_at);
  elsif p_operation = 'job_update' then
    if v_row.document->>'runId' is distinct from p_payload->>'runId'
      or v_row.document->>'status' not in ('transcribing','analyzing') then
      return public.kotonoha_store('get', p_owner, p_id);
    end if;
    update kotonoha.meetings set document = document || (p_payload->'patch'),
      response_id = case when p_payload ? 'responseId' then p_payload->>'responseId' else response_id end,
      lease_until = now() + case when p_payload ? 'responseId' then interval '30 minutes' else interval '4 minutes' end,
      updated_at = now() where id = p_id and owner_id = p_owner;
  elsif p_operation in ('patch','delete','claim') then
    if v_row.document->>'status' in ('transcribing','analyzing') and v_row.lease_until > now() then raise exception 'BUSY'; end if;
    if p_operation = 'delete' then
      update kotonoha.meetings set deleted_at = now(), updated_at = now() where id = p_id and owner_id = p_owner;
      return '{"deleted":true}'::jsonb;
    elsif p_operation = 'patch' then
      update kotonoha.meetings set document = document || p_payload, updated_at = now() where id = p_id and owner_id = p_owner;
    else
      select count(*) into v_count from kotonoha.meetings where owner_id = p_owner and deleted_at is null and id <> p_id
        and document->>'status' in ('transcribing','analyzing') and lease_until > now();
      if v_count >= 2 then raise exception 'CONCURRENCY_LIMIT'; end if;
      update kotonoha.meetings set document = document || p_payload, response_id = null,
        lease_until = now() + interval '4 minutes', updated_at = now() where id = p_id and owner_id = p_owner;
    end if;
  else raise exception 'INVALID_OPERATION' using errcode = '22023';
  end if;
  return public.kotonoha_store('get', p_owner, p_id);
end;
$function$;
revoke all on function public.kotonoha_store(text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kotonoha_store(text, uuid, uuid, jsonb) to service_role;

-- Existing Storage policies explicitly name their own buckets; none are modified.
-- This new bucket has no client policies. Only the Edge Function can manage it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kotonoha-audio', 'kotonoha-audio', false, 24000000,
  array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/webm','video/webm','video/mp4','audio/ogg','audio/flac','application/octet-stream']);

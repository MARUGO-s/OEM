-- Google Meet recording bot: per-meeting single-purpose upload tokens for kotonoha.
-- Additive and kotonoha-only: one private table in the kotonoha schema and one service_role RPC.
-- No other app's tables, functions, Auth, Storage policies, extensions or cron jobs are changed.
-- Only the SHA-256 of each upload token is stored. The plain token exists only in the webhook
-- sent to the bot. A token is valid for one meeting, for 6 hours, and only while that meeting
-- is waiting for the bot ('bot') or receiving its audio ('uploading'); /complete revokes it.

create table kotonoha.bot_requests (
  id uuid primary key,
  owner_id uuid not null,
  meeting_id uuid not null references kotonoha.meetings(id) on delete cascade,
  meet_url text not null check (meet_url ~ '^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table kotonoha.bot_requests is 'Kotonoha Meet bot requests. Holds only upload token hashes. No FK or trigger to other applications.';
create index kotonoha_bot_requests_meeting on kotonoha.bot_requests(meeting_id);
create index kotonoha_bot_requests_expiry on kotonoha.bot_requests(expires_at);
alter table kotonoha.bot_requests enable row level security;
revoke all on kotonoha.bot_requests from public, anon, authenticated;

create or replace function public.kotonoha_bot(
  p_operation text, p_owner uuid default null, p_id uuid default null, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m kotonoha.meetings%rowtype;
  r kotonoha.bot_requests%rowtype;
  n integer;
  v_now text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_expiry timestamptz;
begin
  -- Token lookup for the bot endpoints (no session). Returns the workspace and the one meeting.
  if p_operation = 'auth' then
    if coalesce(p_payload->>'tokenHash', '') !~ '^[0-9a-f]{64}$' then return '{"error":"INVALID_TOKEN"}'::jsonb; end if;
    select b.* into r from kotonoha.bot_requests b join kotonoha.meetings mt on mt.id = b.meeting_id
      where b.token_hash = p_payload->>'tokenHash' and b.used_at is null and b.expires_at > now()
        and mt.owner_id = b.owner_id and mt.deleted_at is null and mt.document->>'status' in ('bot', 'uploading');
    if not found then return '{"error":"INVALID_TOKEN"}'::jsonb; end if;
    return jsonb_build_object('workspaceId', r.owner_id, 'meetingId', r.meeting_id,
      'requestId', r.id, 'expiresAt', r.expires_at);
  end if;
  if p_owner is null or p_id is null then raise exception 'NOT_FOUND'; end if;

  if p_operation = 'create' then
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 1477));
    if coalesce(p_payload->>'tokenHash', '') !~ '^[0-9a-f]{64}$' or p_payload->'document'->>'status' <> 'bot'
      or p_payload->'document'->'bot'->>'requestId' is null then
      raise exception 'INVALID_OPERATION' using errcode = '22023';
    end if;
    delete from kotonoha.bot_requests where owner_id = p_owner and expires_at < now() - interval '7 days';
    select count(*) into n from kotonoha.meetings where owner_id = p_owner and deleted_at is null;
    if n >= 1000 then raise exception 'MEETING_LIMIT'; end if;
    select count(*) into n from kotonoha.bot_requests b join kotonoha.meetings mt on mt.id = b.meeting_id
      where b.owner_id = p_owner and b.used_at is null and b.expires_at > now()
        and mt.deleted_at is null and mt.document->>'status' = 'bot';
    if n >= 5 then raise exception 'BOT_LIMIT'; end if;
    v_expiry := least((p_payload->'document'->'bot'->>'expiresAt')::timestamptz, now() + interval '6 hours 5 minutes');
    insert into kotonoha.meetings(id, owner_id, document)
      values (p_id, p_owner, (p_payload->'document') || jsonb_build_object('id', p_id));
    insert into kotonoha.bot_requests(id, owner_id, meeting_id, meet_url, token_hash, expires_at)
      values ((p_payload->'document'->'bot'->>'requestId')::uuid, p_owner, p_id,
        p_payload->'document'->'bot'->>'meetUrl', p_payload->>'tokenHash', v_expiry);
    return public.kotonoha_store('get', p_owner, p_id);
  end if;

  if p_operation = 'plan' then
    -- Same lock and in-progress upload limit as kotonoha_audio_upload('create').
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 1477));
  end if;
  select * into m from kotonoha.meetings where id = p_id and owner_id = p_owner and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (m.document ? 'bot') then raise exception 'NOT_FOUND'; end if;

  if p_operation = 'status' then
    if m.document->>'status' not in ('bot', 'uploading') then raise exception 'BOT_CLOSED'; end if;
    if p_payload->>'state' not in ('joining', 'recording', 'uploading', 'error') then
      raise exception 'INVALID_OPERATION' using errcode = '22023';
    end if;
    update kotonoha.meetings set document = jsonb_set(document, '{bot}', (document->'bot') || jsonb_build_object(
        'state', p_payload->>'state', 'message', left(p_payload->>'message', 500), 'updatedAt', v_now)),
      updated_at = now() where id = p_id;
  elsif p_operation = 'plan' then
    -- 'bot' -> 'uploading' with the part plan. A retry before any part was committed may replace it.
    if not (m.document->>'status' = 'bot' or (m.document->>'status' = 'uploading'
        and jsonb_array_length(coalesce(m.document->'audioParts', '[]'::jsonb)) = 0)) then
      raise exception 'UPLOAD_ORDER';
    end if;
    select count(*) into n from kotonoha.meetings where owner_id = p_owner and deleted_at is null
      and id <> p_id and document->>'status' = 'uploading';
    if n >= 2 then raise exception 'UPLOAD_LIMIT'; end if;
    update kotonoha.meetings set document = document
        || ((p_payload->'document') - 'id' - 'createdAt' - 'bot' - 'attachments' - 'attachmentPlan')
        || jsonb_build_object(
          'status', 'uploading',
          -- Attachments added while waiting for the bot are already stored; /complete must accept them.
          'attachmentPlan', (select coalesce(jsonb_agg(jsonb_build_object('id', f->'id', 'name', f->'name', 'size', f->'size')), '[]'::jsonb)
            from jsonb_array_elements(coalesce(document->'attachments', '[]'::jsonb)) f),
          'bot', (document->'bot') || jsonb_build_object('state', 'uploading', 'message', null, 'updatedAt', v_now)),
      updated_at = now() where id = p_id;
  elsif p_operation = 'revoke' then
    update kotonoha.bot_requests set used_at = now() where meeting_id = p_id and owner_id = p_owner and used_at is null;
    update kotonoha.meetings set document = jsonb_set(document, '{bot,completedAt}', to_jsonb(v_now)),
      updated_at = now() where id = p_id;
  elsif p_operation = 'discard' then
    -- The webhook could not be delivered: nothing was recorded, so remove the placeholder.
    if m.document->>'status' <> 'bot' then raise exception 'BOT_CLOSED'; end if;
    update kotonoha.bot_requests set used_at = now() where meeting_id = p_id and owner_id = p_owner and used_at is null;
    update kotonoha.meetings set deleted_at = now(), updated_at = now() where id = p_id;
    return '{"deleted":true}'::jsonb;
  else
    raise exception 'INVALID_OPERATION' using errcode = '22023';
  end if;
  return public.kotonoha_store('get', p_owner, p_id);
end $$;
revoke all on function public.kotonoha_bot(text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kotonoha_bot(text, uuid, uuid, jsonb) to service_role;

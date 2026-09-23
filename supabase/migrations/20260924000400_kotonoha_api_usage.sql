-- Usage history belongs only to the meeting workspace and remains after a
-- meeting is removed. Only the authenticated Edge Function invokes this RPC.
create table kotonoha.api_usage (
  owner_id uuid not null,
  event_id uuid not null,
  created_at timestamptz not null default now(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  primary key (owner_id, event_id)
);
create index kotonoha_api_usage_month on kotonoha.api_usage(owner_id, created_at desc);
alter table kotonoha.api_usage enable row level security;
revoke all on kotonoha.api_usage from public, anon, authenticated;

create function public.kotonoha_usage(
  p_operation text, p_owner uuid, p_id uuid default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_month text;
  v_page integer;
  v_from timestamptz;
  v_until timestamptz;
  v_count bigint;
  v_total numeric;
  v_unpriced bigint;
  v_events jsonb;
begin
  if p_owner is null then raise exception 'OWNER_REQUIRED'; end if;
  if p_operation = 'record' then
    if (p_payload->>'id') is null or
       coalesce(p_payload->>'kind', '') not in ('transcription','minutes') or
       coalesce(p_payload->>'model', '') not in ('gpt-transcribe','gemini-3.5-transcribe','gpt-6-astra','gpt-6-sol') then
      raise exception 'INVALID_USAGE';
    end if;
    insert into kotonoha.api_usage(owner_id, event_id, payload)
    values (p_owner, (p_payload->>'id')::uuid, p_payload - 'createdAt')
    on conflict (owner_id, event_id) do nothing;
    return '{"recorded":true}'::jsonb;
  elsif p_operation = 'list' then
    v_month := p_payload->>'month';
    v_page := (p_payload->>'page')::integer;
    if v_month is null or v_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or
       v_page is null or v_page < 0 or v_page > 100000 then
      raise exception 'INVALID_USAGE_QUERY';
    end if;
    v_from := (v_month || '-01 00:00:00')::timestamp at time zone 'Asia/Tokyo';
    v_until := (v_from at time zone 'Asia/Tokyo' + interval '1 month') at time zone 'Asia/Tokyo';
    select count(*), coalesce(sum((payload->>'costUsd')::numeric), 0),
      count(*) filter (where payload->>'costUsd' is null)
      into v_count, v_total, v_unpriced
      from kotonoha.api_usage
      where owner_id = p_owner and created_at >= v_from and created_at < v_until;
    select coalesce(jsonb_agg(event order by created_at desc, event_id desc), '[]'::jsonb)
      into v_events from (
        select created_at, event_id,
          payload || jsonb_build_object('createdAt', created_at) as event
        from kotonoha.api_usage
        where owner_id = p_owner and created_at >= v_from and created_at < v_until
        order by created_at desc, event_id desc
        limit 100 offset v_page * 100
      ) page;
    return jsonb_build_object('month', v_month, 'eventCount', v_count,
      'totalUsd', v_total, 'unpricedCount', v_unpriced, 'events', v_events);
  end if;
  raise exception 'INVALID_OPERATION';
end;
$function$;
revoke all on function public.kotonoha_usage(text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kotonoha_usage(text, uuid, uuid, jsonb) to service_role;

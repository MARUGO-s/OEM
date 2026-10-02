-- Additive QR storage in the existing private workspace schema.
create table kotonoha.qr_links (
  id uuid primary key,
  owner_id uuid not null,
  code text not null unique check (code ~ '^[A-Za-z0-9_-]{12}$'),
  title text not null check (length(title) between 1 and 120),
  target_url text not null check (length(target_url) <= 2048 and target_url ~ '^https?://'),
  scan_count bigint not null default 0 check (scan_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz
);
create index qr_links_owner_created_idx on kotonoha.qr_links(owner_id, created_at desc, id);

create table kotonoha.qr_access_logs (
  id bigint generated always as identity primary key,
  link_id uuid not null references kotonoha.qr_links(id),
  event_id uuid not null,
  accessed_at timestamptz not null default now(),
  user_agent text check (length(user_agent) <= 512),
  unique(link_id, event_id)
);
create index qr_access_logs_link_time_idx on kotonoha.qr_access_logs(link_id, accessed_at desc, id);
alter table kotonoha.qr_links enable row level security;
alter table kotonoha.qr_access_logs enable row level security;
revoke all on kotonoha.qr_links, kotonoha.qr_access_logs from public, anon, authenticated;

-- Only the Edge Function may call this entrypoint. It validates shared sessions
-- for management. Anonymous visitors can only submit an opaque code + event ID.
create function public.kotonoha_qr(
  p_operation text, p_owner uuid default null, p_id uuid default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_link kotonoha.qr_links%rowtype;
  v_page integer := greatest(0, least(100000, coalesce((p_payload->>'page')::integer, 0)));
  v_result jsonb;
  v_inserted integer;
begin
  if p_operation = 'scan' then
    select * into v_link from kotonoha.qr_links where code = p_payload->>'code' for update;
    if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
    if not v_link.active then raise exception 'INACTIVE' using errcode = 'P0001'; end if;
    insert into kotonoha.qr_access_logs(link_id, event_id, user_agent)
      values(v_link.id, (p_payload->>'eventId')::uuid, left(p_payload->>'userAgent',512))
      on conflict(link_id,event_id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      update kotonoha.qr_links set scan_count = scan_count + 1, last_accessed_at = now() where id=v_link.id;
    end if;
    return jsonb_build_object('targetUrl',v_link.target_url);
  end if;
  if p_owner is null then raise exception 'OWNER_REQUIRED'; end if;
  if p_operation = 'list' then
    select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc,l.id),'[]'::jsonb) into v_result
      from (select * from kotonoha.qr_links where owner_id=p_owner order by created_at desc,id limit 50 offset v_page*50) l;
    return jsonb_build_object('links',v_result,'total',(select count(*) from kotonoha.qr_links where owner_id=p_owner));
  elsif p_operation = 'create' then
    insert into kotonoha.qr_links(id,owner_id,code,title,target_url)
      values(p_id,p_owner,p_payload->>'code',p_payload->>'title',p_payload->>'targetUrl')
      on conflict(id) do nothing;
    select * into v_link from kotonoha.qr_links where id=p_id and owner_id=p_owner;
    if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
    if v_link.title is distinct from p_payload->>'title' or v_link.target_url is distinct from p_payload->>'targetUrl' then
      raise exception 'REQUEST_CONFLICT';
    end if;
    return to_jsonb(v_link);
  end if;
  select * into v_link from kotonoha.qr_links where id=p_id and owner_id=p_owner;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if p_operation = 'history' then
    select coalesce(jsonb_agg(to_jsonb(e) order by e.accessed_at desc,e.id desc),'[]'::jsonb) into v_result
      from (select id,accessed_at,user_agent from kotonoha.qr_access_logs where link_id=p_id order by accessed_at desc,id desc limit 30 offset v_page*30) e;
    return jsonb_build_object('events',v_result,'total',v_link.scan_count);
  elsif p_operation = 'active' then
    update kotonoha.qr_links set active=(p_payload->>'active')::boolean where id=p_id and owner_id=p_owner returning * into v_link;
    return to_jsonb(v_link);
  end if;
  raise exception 'INVALID_OPERATION';
end;
$function$;
revoke all on function public.kotonoha_qr(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kotonoha_qr(text,uuid,uuid,jsonb) to service_role;

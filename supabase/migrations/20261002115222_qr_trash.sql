-- Soft deletion is private to the QR workspace; no existing records are deleted.
alter table kotonoha.qr_links add column deleted_at timestamptz;
-- This protects legacy scan endpoints too: a trashed link cannot be active.
alter table kotonoha.qr_links add constraint qr_links_trash_inactive
  check (deleted_at is null or not active);
create index qr_links_owner_trash_idx on kotonoha.qr_links(owner_id,deleted_at desc,id)
  where deleted_at is not null;

create or replace function public.kotonoha_qr(
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
    if v_link.deleted_at is not null or not v_link.active then raise exception 'INACTIVE' using errcode = 'P0001'; end if;
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
  if p_operation in ('list','trash_list') then
    select coalesce(jsonb_agg(to_jsonb(l) order by case when p_operation='trash_list' then l.deleted_at else l.created_at end desc,l.id),'[]'::jsonb) into v_result
      from (select * from kotonoha.qr_links where owner_id=p_owner and ((p_operation='list' and deleted_at is null) or (p_operation='trash_list' and deleted_at is not null)) order by case when p_operation='trash_list' then deleted_at else created_at end desc,id limit 50 offset v_page*50) l;
    return jsonb_build_object('links',v_result,'total',(select count(*) from kotonoha.qr_links where owner_id=p_owner and ((p_operation='list' and deleted_at is null) or (p_operation='trash_list' and deleted_at is not null))));
  elsif p_operation = 'create' then
    insert into kotonoha.qr_links(id,owner_id,code,title,target_url)
      values(p_id,p_owner,p_payload->>'code',p_payload->>'title',p_payload->>'targetUrl')
      on conflict(id) do nothing;
    select * into v_link from kotonoha.qr_links where id=p_id and owner_id=p_owner;
    if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
    if v_link.title is distinct from p_payload->>'title' or v_link.target_url is distinct from p_payload->>'targetUrl' then
      raise exception 'REQUEST_CONFLICT';
    end if;
    if v_link.deleted_at is not null then raise exception 'TRASHED'; end if;
    return to_jsonb(v_link);
  end if;
  select * into v_link from kotonoha.qr_links where id=p_id and owner_id=p_owner for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if p_operation = 'history' then
    select coalesce(jsonb_agg(to_jsonb(e) order by e.accessed_at desc,e.id desc),'[]'::jsonb) into v_result
      from (select id,accessed_at,user_agent from kotonoha.qr_access_logs where link_id=p_id order by accessed_at desc,id desc limit 30 offset v_page*30) e;
    return jsonb_build_object('events',v_result,'total',v_link.scan_count);
  elsif p_operation = 'active' then
    if v_link.deleted_at is not null then raise exception 'TRASHED'; end if;
    update kotonoha.qr_links set active=(p_payload->>'active')::boolean where id=p_id and owner_id=p_owner returning * into v_link;
    return to_jsonb(v_link);
  end if;
  raise exception 'INVALID_OPERATION';
end;
$function$;
revoke all on function public.kotonoha_qr(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kotonoha_qr(text,uuid,uuid,jsonb) to service_role;

-- Lifecycle and scans lock the same parent row to serialize competing operations.
create function public.kotonoha_qr_lifecycle(
  p_operation text, p_owner uuid, p_id uuid, p_confirm_id uuid default null
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_link kotonoha.qr_links%rowtype;
begin
  if p_owner is null then raise exception 'OWNER_REQUIRED'; end if;
  if p_id is null then raise exception 'ID_REQUIRED'; end if;
  if p_operation is null or p_operation not in ('trash','restore','purge') then
    raise exception 'INVALID_OPERATION';
  end if;
  if p_operation='purge' and p_confirm_id is distinct from p_id then
    raise exception 'CONFIRM_REQUIRED';
  end if;
  select * into v_link from kotonoha.qr_links where id=p_id and owner_id=p_owner for update;
  if not found then
    -- A repeated purge can safely report completion without revealing ownership.
    if p_operation='purge' then return jsonb_build_object('id',p_id,'purged',true); end if;
    raise exception 'NOT_FOUND' using errcode='P0002';
  end if;
  if p_operation='trash' then
    update kotonoha.qr_links set deleted_at=coalesce(deleted_at,now()),active=false
      where id=p_id and owner_id=p_owner returning * into v_link;
  elsif p_operation='restore' then
    if v_link.deleted_at is not null then
      -- Restoring never silently resumes a printed QR: the user explicitly resumes.
      update kotonoha.qr_links set deleted_at=null,active=false
        where id=p_id and owner_id=p_owner returning * into v_link;
    end if;
  else
    if v_link.deleted_at is null then raise exception 'NOT_TRASHED'; end if;
    delete from kotonoha.qr_access_logs where link_id=p_id;
    delete from kotonoha.qr_links where id=p_id and owner_id=p_owner;
    return jsonb_build_object('id',p_id,'purged',true);
  end if;
  return to_jsonb(v_link);
end;
$function$;
revoke all on function public.kotonoha_qr_lifecycle(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kotonoha_qr_lifecycle(text,uuid,uuid,uuid) to service_role;

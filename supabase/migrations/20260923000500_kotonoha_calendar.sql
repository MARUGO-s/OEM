-- Atomically update one shared-calendar override in the dedicated app only.
create function public.kotonoha_calendar(p_operation text,p_owner uuid,p_id uuid,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m kotonoha.meetings%rowtype; edits jsonb; event_key text;
begin
  select * into m from kotonoha.meetings where id=p_id and owner_id=p_owner and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if m.document->>'status' in ('uploading','transcribing','analyzing') then raise exception 'BUSY'; end if;
  event_key:=p_payload->>'eventId';
  if event_key is null or event_key !~ '^[a-f0-9]{16}$' then raise exception 'INVALID_OPERATION'; end if;
  edits:=coalesce(m.document->'calendarOverrides','{}'::jsonb);
  if p_operation='set' then
    if jsonb_typeof(p_payload->'value') is distinct from 'object' then raise exception 'INVALID_OPERATION'; end if;
    if not (edits ? event_key) and (select count(*) from jsonb_object_keys(edits))>=200 then raise exception 'CALENDAR_LIMIT'; end if;
    edits:=edits||jsonb_build_object(event_key,p_payload->'value');
  elsif p_operation='reset' then edits:=edits-event_key;
  else raise exception 'INVALID_OPERATION'; end if;
  update kotonoha.meetings set document=document||jsonb_build_object('calendarOverrides',edits),updated_at=now() where id=p_id;
  return public.kotonoha_store('get',p_owner,p_id);
end $$;
revoke all on function public.kotonoha_calendar(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kotonoha_calendar(text,uuid,uuid,jsonb) to service_role;

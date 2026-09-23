-- Only this application's private rows/functions. No shared Auth or bucket change.
create or replace function public.kotonoha_audio_upload(
  p_operation text, p_owner uuid, p_id uuid, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m kotonoha.meetings%rowtype; n integer; result jsonb;
begin
  if p_owner is null then raise exception 'NOT_FOUND'; end if;
  if p_operation in ('create','complete','next') then
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 1477));
  end if;
  if p_operation = 'create' then
    select count(*) into n from kotonoha.meetings where owner_id=p_owner and deleted_at is null
      and document->>'status'='uploading';
    if n >= 2 then raise exception 'UPLOAD_LIMIT'; end if;
    return public.kotonoha_store('create', p_owner, p_id, p_payload);
  end if;
  select * into m from kotonoha.meetings where id=p_id and owner_id=p_owner and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_operation = 'append' then
    if m.document->>'status' <> 'uploading' or
      (p_payload->>'index')::integer <> jsonb_array_length(m.document->'audioParts') or
      (p_payload->>'index')::integer >= jsonb_array_length(m.document->'uploadPlan') then
      raise exception 'UPLOAD_ORDER';
    end if;
    update kotonoha.meetings set document=jsonb_set(document, '{audioParts}',
      (document->'audioParts') || jsonb_build_array(p_payload->'part')),
      audio_path=coalesce(audio_path,p_payload->'part'->>'audioPath'), updated_at=now() where id=p_id;
  elsif p_operation = 'complete' then
    if m.document->>'status' <> 'uploading' then return public.kotonoha_store('get',p_owner,p_id); end if;
    if jsonb_array_length(m.document->'audioParts') <> jsonb_array_length(m.document->'uploadPlan') then
      raise exception 'UPLOAD_INCOMPLETE';
    end if;
    return public.kotonoha_store('claim', p_owner, p_id,
      jsonb_build_object('status','transcribing','partReady',true,'runId',p_payload->>'runId','error',null));
  elsif p_operation = 'next' then
    if m.document->>'status' not in ('transcribing','analyzing') or
      not coalesce((m.document->>'partReady')::boolean,false) then return null; end if;
    select count(*) into n from kotonoha.meetings where owner_id=p_owner and deleted_at is null and id<>p_id
      and document->>'status' in ('transcribing','analyzing') and lease_until>now();
    if n>=2 then return null; end if;
    update kotonoha.meetings set document=document || jsonb_build_object('partReady',false,'runId',p_payload->>'runId'),
      lease_until=now()+interval '4 minutes', updated_at=now() where id=p_id;
  else raise exception 'UNKNOWN_OPERATION';
  end if;
  return public.kotonoha_store('get',p_owner,p_id);
end;
$$;
revoke all on function public.kotonoha_audio_upload(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kotonoha_audio_upload(text,uuid,uuid,jsonb) to service_role;

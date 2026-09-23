-- Dedicated app bucket and function only; no shared Auth/schema/policy changes.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kotonoha-documents','kotonoha-documents',false,10000000,
 array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.ms-powerpoint','text/csv','text/plain']);

create function public.kotonoha_attachments(p_operation text,p_owner uuid,p_id uuid,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m kotonoha.meetings%rowtype; files jsonb; removed jsonb; total bigint;
begin
  if p_owner is null then raise exception 'NOT_FOUND'; end if;
  if p_operation='complete' then perform pg_advisory_xact_lock(hashtextextended(p_owner::text,1477)); end if;
  select * into m from kotonoha.meetings where id=p_id and owner_id=p_owner and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  files:=coalesce(m.document->'attachments','[]'::jsonb);
  if p_operation='complete' then
    if m.document->>'status'<>'uploading' then return public.kotonoha_store('get',p_owner,p_id); end if;
    if jsonb_array_length(m.document->'audioParts')<>jsonb_array_length(m.document->'uploadPlan') or
       jsonb_array_length(files)<>jsonb_array_length(coalesce(m.document->'attachmentPlan','[]'::jsonb)) or
       exists(select 1 from jsonb_array_elements(coalesce(m.document->'attachmentPlan','[]'::jsonb)) plan
         where not exists(select 1 from jsonb_array_elements(files) f where f->>'id'=plan->>'id' and f->>'name'=plan->>'name' and f->>'size'=plan->>'size'))
    then raise exception 'UPLOAD_INCOMPLETE'; end if;
    return public.kotonoha_store('claim',p_owner,p_id,jsonb_build_object('status',
      case when jsonb_array_length(m.document->'audioParts')>0 then 'transcribing' else 'analyzing' end,
      'partReady',true,'runId',p_payload->>'runId','error',null));
  end if;
  if m.document->>'status' in ('transcribing','analyzing') then raise exception 'BUSY'; end if;
  if coalesce((m.document->>'isDemo')::boolean,false) then raise exception 'ATTACHMENT_DEMO'; end if;
  if p_operation='add' then
    if exists(select 1 from jsonb_array_elements(files) f where f->>'id'=p_payload->'attachment'->>'id') then raise exception 'ATTACHMENT_DUPLICATE'; end if;
    if m.document->>'status'='uploading' and not exists(
      select 1 from jsonb_array_elements(coalesce(m.document->'attachmentPlan','[]'::jsonb)) f
      where f->>'id'=p_payload->'attachment'->>'id' and f->>'size'=p_payload->'attachment'->>'size' and f->>'name'=p_payload->'attachment'->>'name'
    ) then raise exception 'ATTACHMENT_PLAN'; end if;
    files:=files || jsonb_build_array(p_payload->'attachment');
    select sum((f->>'size')::bigint) into total from jsonb_array_elements(files) f;
    if jsonb_array_length(files)>5 or total>25000000 or exists(
      select 1 from jsonb_array_elements(files) f where (f->>'size')::bigint not between 1 and 10000000
    ) then raise exception 'ATTACHMENT_LIMIT'; end if;
  elsif p_operation='remove' then
    if m.document->>'status'='uploading' then raise exception 'BUSY'; end if;
    select f into removed from jsonb_array_elements(files) f where f->>'id'=p_payload->>'attachmentId';
    if removed is null then raise exception 'NOT_FOUND'; end if;
    select coalesce(jsonb_agg(f),'[]'::jsonb) into files from jsonb_array_elements(files) f where f->>'id'<>p_payload->>'attachmentId';
    update kotonoha.meetings set document=document || jsonb_build_object('removedAttachments',
      coalesce(document->'removedAttachments','[]'::jsonb) || jsonb_build_array(removed || jsonb_build_object('removedAt',now()))) where id=p_id;
  else raise exception 'UNKNOWN_OPERATION'; end if;
  update kotonoha.meetings set document=document || jsonb_build_object('attachments',files,'minutesStale',
    coalesce(document->>'markdown','')<>''), updated_at=now() where id=p_id;
  return public.kotonoha_store('get',p_owner,p_id);
end $$;
revoke all on function public.kotonoha_attachments(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kotonoha_attachments(text,uuid,uuid,jsonb) to service_role;

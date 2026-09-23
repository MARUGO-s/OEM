-- Synthetic isolated rows only. No auth, business tables or original user records.
do $$
declare owner uuid:=gen_random_uuid(); id uuid:=gen_random_uuid(); fid uuid:=gen_random_uuid();
  attachment jsonb; r jsonb; denied boolean; i integer;
begin
  attachment:=jsonb_build_object('id',fid,'name','test.pdf','size',10000000,'storagePath','test-only-never-uploaded');
  perform public.kotonoha_audio_upload('create',owner,id,jsonb_build_object('document',jsonb_build_object(
    'id',id,'status','uploading','isDemo',false,'audioParts','[]'::jsonb,'uploadPlan','[]'::jsonb,
    'attachmentPlan',jsonb_build_array(attachment),'attachments','[]'::jsonb,'transcript','Synthetic conversation','markdown','')));
  denied:=false;
  begin perform public.kotonoha_attachments('complete',owner,id,'{"runId":"test"}');
  exception when others then if sqlerrm<>'UPLOAD_INCOMPLETE' then raise; end if; denied:=true; end;
  if not denied then raise exception 'Missing document accepted'; end if;
  denied:=false;
  begin perform public.kotonoha_attachments('add',owner,id,jsonb_build_object('attachment',attachment||'{"name":"wrong.pdf"}'::jsonb));
  exception when others then if sqlerrm<>'ATTACHMENT_PLAN' then raise; end if; denied:=true; end;
  if not denied then raise exception 'Mismatched plan accepted'; end if;
  perform public.kotonoha_attachments('add',owner,id,jsonb_build_object('attachment',attachment));
  denied:=false;
  begin perform public.kotonoha_attachments('add',owner,id,jsonb_build_object('attachment',attachment));
  exception when others then if sqlerrm<>'ATTACHMENT_DUPLICATE' then raise; end if; denied:=true; end;
  if not denied then raise exception 'Duplicate accepted'; end if;
  r:=public.kotonoha_attachments('complete',owner,id,'{"runId":"test"}');
  if r->'document'->>'status'<>'analyzing' then raise exception 'Text and document completion failed'; end if;
  denied:=false;
  begin perform public.kotonoha_attachments('remove',owner,id,jsonb_build_object('attachmentId',fid));
  exception when others then if sqlerrm<>'BUSY' then raise; end if; denied:=true; end;
  if not denied then raise exception 'Active analysis mutated'; end if;
  perform public.kotonoha_store('job_update',owner,id,'{"runId":"test","patch":{"status":"done","markdown":"Synthetic result"}}');
  r:=public.kotonoha_attachments('remove',owner,id,jsonb_build_object('attachmentId',fid));
  if jsonb_array_length(r->'document'->'attachments')<>0 or
     jsonb_array_length(r->'document'->'removedAttachments')<>1 or r->'document'->>'minutesStale'<>'true' then
    raise exception 'Logical unlink failed';
  end if;
  for i in 1..2 loop perform public.kotonoha_attachments('add',owner,id,jsonb_build_object('attachment',attachment||jsonb_build_object('id',gen_random_uuid()))); end loop;
  denied:=false;
  begin perform public.kotonoha_attachments('add',owner,id,jsonb_build_object('attachment',attachment||jsonb_build_object('id',gen_random_uuid())));
  exception when others then if sqlerrm<>'ATTACHMENT_LIMIT' then raise; end if; denied:=true; end;
  if not denied then raise exception '25MB limit exceeded'; end if;
  for i in 1..3 loop perform public.kotonoha_attachments('add',owner,id,jsonb_build_object('attachment',attachment||jsonb_build_object('id',gen_random_uuid(),'size',1))); end loop;
  denied:=false;
  begin perform public.kotonoha_attachments('add',owner,id,jsonb_build_object('attachment',attachment||jsonb_build_object('id',gen_random_uuid(),'size',1)));
  exception when others then if sqlerrm<>'ATTACHMENT_LIMIT' then raise; end if; denied:=true; end;
  if not denied then raise exception '5 file limit exceeded'; end if;
  denied:=false;
  begin perform public.kotonoha_attachments('remove',gen_random_uuid(),id,jsonb_build_object('attachmentId',fid));
  exception when others then if sqlerrm<>'NOT_FOUND' then raise; end if; denied:=true; end;
  if not denied then raise exception 'Workspace isolation failed'; end if;
  if has_function_privilege('anon','public.kotonoha_attachments(text,uuid,uuid,jsonb)','execute') or
     has_function_privilege('authenticated','public.kotonoha_attachments(text,uuid,uuid,jsonb)','execute') or
     not has_function_privilege('service_role','public.kotonoha_attachments(text,uuid,uuid,jsonb)','execute') then
    raise exception 'Client access must be denied';
  end if;
  if (select b.public from storage.buckets b where b.id='kotonoha-documents') then raise exception 'Bucket must be private'; end if;
  delete from kotonoha.meetings where owner_id=owner;
end $$;

-- Safe transactional smoke checks: only a new random, isolated test row.
do $$
declare owner uuid := gen_random_uuid(); id uuid := gen_random_uuid(); r jsonb; denied boolean := false;
begin
  perform public.kotonoha_audio_upload('create',owner,id,jsonb_build_object('document',
    jsonb_build_object('id',id,'isDemo',false,'status','uploading','audioParts','[]'::jsonb,'uploadPlan','[{}]'::jsonb)));
  begin
    perform public.kotonoha_audio_upload('complete',owner,id);
  exception when others then
    if sqlerrm <> 'UPLOAD_INCOMPLETE' then raise; end if;
    denied := true;
  end;
  if not denied then raise exception 'Incomplete upload accepted'; end if;
  perform public.kotonoha_audio_upload('append',owner,id,'{"index":0,"part":{"audioPath":"test-only","transcript":""}}');
  perform public.kotonoha_audio_upload('complete',owner,id,'{"runId":"first"}');
  r := public.kotonoha_audio_upload('next',owner,id,'{"runId":"claimed"}');
  if r->'document'->>'runId' <> 'claimed' or r->'document'->>'partReady' <> 'false' then raise exception 'Claim failed'; end if;
  if public.kotonoha_audio_upload('next',owner,id,'{"runId":"duplicate"}') is not null then raise exception 'Duplicate claim'; end if;
  perform public.kotonoha_store('job_update',owner,id,'{"runId":"stale","patch":{"partReady":true}}');
  if public.kotonoha_audio_upload('next',owner,id,'{"runId":"duplicate"}') is not null then raise exception 'Stale worker update'; end if;
  perform public.kotonoha_store('job_update',owner,id,'{"runId":"claimed","patch":{"partReady":true}}');
  r := public.kotonoha_audio_upload('next',owner,id,'{"runId":"second"}');
  if r->'document'->>'runId' <> 'second' then raise exception 'Continuation failed'; end if;
  denied := false;
  begin
    perform public.kotonoha_audio_upload('next',gen_random_uuid(),id,'{"runId":"wrong-owner"}');
  exception when others then
    if sqlerrm <> 'NOT_FOUND' then raise; end if;
    denied := true;
  end;
  if not denied then raise exception 'Workspace isolation failed'; end if;
  if has_function_privilege('anon','public.kotonoha_audio_upload(text,uuid,uuid,jsonb)','execute') or
     has_function_privilege('authenticated','public.kotonoha_audio_upload(text,uuid,uuid,jsonb)','execute') then
    raise exception 'Client access must be denied';
  end if;
  delete from kotonoha.meetings where owner_id=owner;
end $$;

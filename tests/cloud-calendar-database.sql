-- Own synthetic row only; failure rolls back the whole DO statement.
do $$
declare owner uuid:=gen_random_uuid(); id uuid:=gen_random_uuid(); r jsonb; denied boolean;
  a text:='0000000000000001'; b text:='0000000000000002';
begin
  perform public.kotonoha_store('create',owner,id,jsonb_build_object('document',jsonb_build_object('id',id,'status','done','isDemo',false,'markdown','Synthetic original','runId','test-calendar')));
  perform public.kotonoha_calendar('set',owner,id,jsonb_build_object('eventId',a,'value',jsonb_build_object('event',jsonb_build_object('title','A'))));
  r:=public.kotonoha_calendar('set',owner,id,jsonb_build_object('eventId',b,'value',jsonb_build_object('event',jsonb_build_object('title','B'))));
  if not (r->'document'->'calendarOverrides' ? a) or not (r->'document'->'calendarOverrides' ? b) then raise exception 'Edits clobbered'; end if;
  if r->'document'->>'markdown'<>'Synthetic original' then raise exception 'Original body changed'; end if;
  perform public.kotonoha_store('job_update',owner,id,'{"runId":"test-calendar","patch":{"status":"done","markdown":"Synthetic regenerated"}}');
  r:=public.kotonoha_store('get',owner,id);
  if not (r->'document'->'calendarOverrides' ? a) then raise exception 'Regeneration lost override'; end if;
  denied:=false;
  begin perform public.kotonoha_calendar('reset',gen_random_uuid(),id,jsonb_build_object('eventId',a));
  exception when others then if sqlerrm<>'NOT_FOUND' then raise; end if; denied:=true; end;
  if not denied then raise exception 'Wrong owner allowed'; end if;
  update kotonoha.meetings set document=document||'{"status":"analyzing"}'::jsonb where owner_id=owner;
  denied:=false;
  begin perform public.kotonoha_calendar('reset',owner,id,jsonb_build_object('eventId',a));
  exception when others then if sqlerrm<>'BUSY' then raise; end if; denied:=true; end;
  if not denied then raise exception 'Active job changed'; end if;
  update kotonoha.meetings set document=document||'{"status":"done"}'::jsonb where owner_id=owner;
  r:=public.kotonoha_calendar('reset',owner,id,jsonb_build_object('eventId',a));
  if (r->'document'->'calendarOverrides' ? a) or not (r->'document'->'calendarOverrides' ? b) then raise exception 'Reset lost another edit'; end if;
  if has_function_privilege('anon','public.kotonoha_calendar(text,uuid,uuid,jsonb)','execute') or has_function_privilege('authenticated','public.kotonoha_calendar(text,uuid,uuid,jsonb)','execute') or not has_function_privilege('service_role','public.kotonoha_calendar(text,uuid,uuid,jsonb)','execute') then raise exception 'Function ACL invalid'; end if;
  delete from kotonoha.meetings where owner_id=owner;
end $$;

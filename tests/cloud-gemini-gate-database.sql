-- Roll back every synthetic row. No API keys, user meetings or other apps touched.
begin;
do $$
declare
  workspace uuid := gen_random_uuid();
  first_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  r jsonb;
  blocked boolean := false;
begin
  if has_function_privilege('anon','public.kotonoha_gemini_gate(text,uuid,uuid,jsonb)','execute') or
     has_function_privilege('authenticated','public.kotonoha_gemini_gate(text,uuid,uuid,jsonb)','execute') or
     not has_function_privilege('service_role','public.kotonoha_gemini_gate(text,uuid,uuid,jsonb)','execute') then
    raise exception 'Invalid client/server permissions';
  end if;
  -- Exercise the same service-only RPCs the Edge Function uses.
  execute 'set local role service_role';
  perform public.kotonoha_store('create',workspace,first_id,jsonb_build_object('document',
    jsonb_build_object('status','transcribing','runId','first','isDemo',false)));
  perform public.kotonoha_store('create',workspace,second_id,jsonb_build_object('document',
    jsonb_build_object('status','transcribing','runId','second','isDemo',false)));
  if public.kotonoha_gemini_gate('reserve',workspace,first_id,'{"runId":"stale"}') is not null then
    raise exception 'Stale run accepted';
  end if;
  r := public.kotonoha_gemini_gate('reserve',workspace,first_id,'{"runId":"first"}');
  if r->>'allowed' is distinct from 'true' then raise exception 'First reservation failed'; end if;
  r := public.kotonoha_gemini_gate('reserve',workspace,second_id,'{"runId":"second"}');
  if r->>'allowed' is distinct from 'false' then raise exception 'Overlapping job accepted'; end if;
  if public.kotonoha_gemini_gate('finish',workspace,second_id,'{"runId":"second"}') is not null then
    raise exception 'Wrong job released the lock';
  end if;
  r := public.kotonoha_gemini_gate('finish',workspace,first_id,'{"runId":"first","delayMs":90000,"reason":"rate_limit"}');
  if r->>'reason'<>'rate_limit' or (r->>'until')::timestamptz < clock_timestamp()+interval '89 seconds' then
    raise exception 'Google cooldown not persisted';
  end if;
  r := public.kotonoha_gemini_gate('reserve',workspace,second_id,'{"runId":"second"}');
  if r->>'allowed' is distinct from 'false' or r->>'reason'<>'rate_limit' then raise exception 'Cooldown bypassed'; end if;
  begin
    perform public.kotonoha_gemini_gate('reserve',gen_random_uuid(),first_id,'{"runId":"first"}');
  exception when others then
    if sqlerrm <> 'NOT_FOUND' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Workspace boundary bypassed'; end if;
  execute 'reset role';
  -- Move only this isolated fixture's clock to test expiration without sleeping.
  update kotonoha.gemini_throttle set next_allowed_at=clock_timestamp()-interval '1 second' where owner_id=workspace;
  execute 'set local role service_role';
  r := public.kotonoha_gemini_gate('reserve',workspace,second_id,'{"runId":"second"}');
  if r->>'allowed' is distinct from 'true' then raise exception 'Resume failed'; end if;
  r := public.kotonoha_gemini_gate('finish',workspace,second_id,'{"runId":"second"}');
  if r->>'reason'<>'spacing' or (r->>'until')::timestamptz < clock_timestamp()+interval '29 seconds' then
    raise exception 'Minimum spacing missing';
  end if;
  execute 'reset role';
  -- An abandoned worker's gate must be recoverable after its lease expires.
  update kotonoha.gemini_throttle set next_allowed_at=clock_timestamp()-interval '1 second',
    active_run_id='abandoned', active_until=clock_timestamp()-interval '1 second' where owner_id=workspace;
  execute 'set local role service_role';
  r := public.kotonoha_gemini_gate('reserve',workspace,first_id,'{"runId":"first"}');
  if r->>'allowed' is distinct from 'true' then raise exception 'Abandoned gate did not recover'; end if;
  execute 'reset role';
end $$;
rollback;

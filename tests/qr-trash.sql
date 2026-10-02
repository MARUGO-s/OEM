-- Only random test fixtures are modified. Everything, including deletions, rolls back.
begin;
do $test$
declare
  v_owner uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_id uuid := gen_random_uuid();
  v_event uuid := gen_random_uuid();
  v_code text := substr(md5(v_id::text),1,12);
  v_before timestamptz;
  v_data jsonb;
  v_temp uuid;
  i integer;
begin
  v_data := public.kotonoha_qr('create',v_owner,v_id,jsonb_build_object('code',v_code,'title','trash test','targetUrl','https://example.com/'));
  perform public.kotonoha_qr_scan(v_code,v_event,'qr');
  assert (public.kotonoha_qr('list',v_owner)->>'total')::integer=1;
  assert (public.kotonoha_qr('trash_list',v_owner)->>'total')::integer=0;
  begin
    perform public.kotonoha_qr_lifecycle('purge',v_owner,v_id,v_id);
    raise exception 'ACTIVE_PURGE_ALLOWED';
  exception when others then if sqlerrm <> 'NOT_TRASHED' then raise; end if; end;
  begin
    perform public.kotonoha_qr_lifecycle('purge',v_owner,v_id);
    raise exception 'UNCONFIRMED_PURGE_ALLOWED';
  exception when others then if sqlerrm <> 'CONFIRM_REQUIRED' then raise; end if; end;
  begin
    perform public.kotonoha_qr_lifecycle('trash',v_other,v_id);
    raise exception 'OTHER_OWNER_TRASH_ALLOWED';
  exception when others then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;
  begin
    perform public.kotonoha_qr_lifecycle('trash',null,v_id);
    raise exception 'MISSING_OWNER_ALLOWED';
  exception when others then if sqlerrm <> 'OWNER_REQUIRED' then raise; end if; end;
  v_data := public.kotonoha_qr_lifecycle('trash',v_owner,v_id);
  assert (v_data->>'deleted_at') is not null and not (v_data->>'active')::boolean;
  v_before := (v_data->>'deleted_at')::timestamptz;
  v_data := public.kotonoha_qr_lifecycle('trash',v_owner,v_id);
  assert (v_data->>'deleted_at')::timestamptz=v_before;
  assert (public.kotonoha_qr('list',v_owner)->>'total')::integer=0;
  assert (public.kotonoha_qr('trash_list',v_owner)->>'total')::integer=1;
  assert (public.kotonoha_qr('trash_list',v_other)->>'total')::integer=0;
  assert jsonb_array_length(public.kotonoha_qr_history(v_owner,v_id)->'events')=1;
  assert (public.kotonoha_qr_analytics(v_owner,v_id)->>'total')::integer=1;
  begin
    perform public.kotonoha_qr_scan(v_code,gen_random_uuid());
    raise exception 'TRASH_SCAN_ALLOWED';
  exception when others then if sqlerrm <> 'INACTIVE' then raise; end if; end;
  begin
    perform public.kotonoha_qr('scan',null,null,jsonb_build_object('code',v_code,'eventId',gen_random_uuid()));
    raise exception 'LEGACY_TRASH_SCAN_ALLOWED';
  exception when others then if sqlerrm <> 'INACTIVE' then raise; end if; end;
  begin
    perform public.kotonoha_qr('active',v_owner,v_id,'{"active":true}');
    raise exception 'TRASH_REACTIVATION_ALLOWED';
  exception when others then if sqlerrm <> 'TRASHED' then raise; end if; end;
  begin
    update kotonoha.qr_links set active=true where id=v_id;
    raise exception 'TRASH_CONSTRAINT_FAILED';
  exception when check_violation then null; end;
  begin
    perform public.kotonoha_qr('create',v_owner,v_id,jsonb_build_object('code',v_code,'title','trash test','targetUrl','https://example.com/'));
    raise exception 'TRASH_RECREATE_ALLOWED';
  exception when others then if sqlerrm <> 'TRASHED' then raise; end if; end;
  perform public.kotonoha_qr_lifecycle('purge',v_other,v_id,v_id);
  assert exists(select 1 from kotonoha.qr_links where id=v_id and owner_id=v_owner);
  v_data := public.kotonoha_qr_lifecycle('restore',v_owner,v_id);
  assert v_data->>'deleted_at' is null and not (v_data->>'active')::boolean;
  assert v_data->>'code'=v_code and (v_data->>'scan_count')::integer=1;
  assert jsonb_array_length(public.kotonoha_qr_history(v_owner,v_id)->'events')=1;
  perform public.kotonoha_qr('active',v_owner,v_id,'{"active":true}');
  v_data := public.kotonoha_qr_lifecycle('restore',v_owner,v_id);
  assert (v_data->>'active')::boolean, 'Repeated restoration must not pause an already resumed link';
  perform public.kotonoha_qr_scan(v_code,v_event,'qr');
  perform public.kotonoha_qr_scan(v_code,gen_random_uuid(),'button');
  assert (public.kotonoha_qr_history(v_owner,v_id)->>'total')::integer=2;
  perform public.kotonoha_qr_lifecycle('trash',v_owner,v_id);
  perform public.kotonoha_qr_lifecycle('purge',v_owner,v_id,v_id);
  assert not exists(select 1 from kotonoha.qr_access_logs where link_id=v_id);
  assert not exists(select 1 from kotonoha.qr_links where id=v_id);
  assert (public.kotonoha_qr_lifecycle('purge',v_owner,v_id,v_id)->>'purged')::boolean;
  begin
    perform public.kotonoha_qr_scan(v_code,gen_random_uuid());
    raise exception 'PURGED_SCAN_ALLOWED';
  exception when others then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;
  for i in 1..52 loop
    v_temp := gen_random_uuid();
    insert into kotonoha.qr_links(id,owner_id,code,title,target_url,active,deleted_at)
      values(v_temp,v_owner,substr(md5(v_temp::text),1,12),'pagination test','https://example.com/',false,now()+i*interval '1 second');
  end loop;
  v_data := public.kotonoha_qr('trash_list',v_owner,null,'{"page":0}');
  assert (v_data->>'total')::integer=52 and jsonb_array_length(v_data->'links')=50;
  assert jsonb_array_length(public.kotonoha_qr('trash_list',v_owner,null,'{"page":1}')->'links')=2;
  assert (public.kotonoha_qr('list',v_owner)->>'total')::integer=0;
  assert not has_function_privilege('anon','public.kotonoha_qr_lifecycle(text,uuid,uuid,uuid)','EXECUTE');
  assert not has_function_privilege('authenticated','public.kotonoha_qr_lifecycle(text,uuid,uuid,uuid)','EXECUTE');
  assert has_function_privilege('service_role','public.kotonoha_qr_lifecycle(text,uuid,uuid,uuid)','EXECUTE');
end;
$test$;
rollback;

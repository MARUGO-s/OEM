-- Random, rollback-only fixtures. No existing files or links are changed.
begin;
do $test$
declare
  own uuid:=gen_random_uuid(); other_owner uuid:=gen_random_uuid(); item uuid:=gen_random_uuid();
  code text:=substr(md5(item::text),1,12); data jsonb; args jsonb;
begin
  args:=jsonb_build_object('title','file test','fileName','menu.pdf','mime','application/pdf','size',100);
  data:=public.kotonoha_qr_file('init',own,item,args);
  assert data->>'state'='pending';
  assert data->>'path'=own::text||'/'||item::text||'/file.pdf';
  assert public.kotonoha_qr_file('get',other_owner,item) is null;
  begin
    perform public.kotonoha_qr_file('init',other_owner,item,args);
    raise exception 'OWNER_ISOLATION_FAILED';
  exception when others then if sqlerrm<>'REQUEST_CONFLICT' then raise; end if; end;
  begin
    perform public.kotonoha_qr_file('init',own,item,args||'{"size":101}');
    raise exception 'REPLAY_CHECK_FAILED';
  exception when others then if sqlerrm<>'REQUEST_CONFLICT' then raise; end if; end;
  assert public.kotonoha_qr_file('init',own,item,args)->>'id'=item::text;
  data:=public.kotonoha_qr_file('complete',own,item,jsonb_build_object('code',code,'targetUrl','https://marugo-s.github.io/multiapp/?file='||code));
  assert data->>'id'=item::text;
  assert public.kotonoha_qr_file('complete',own,item,'{}')->>'code'=code;
  assert public.kotonoha_qr_file('public',null,null,jsonb_build_object('code',code))->>'file_name'='menu.pdf';
  perform public.kotonoha_qr_scan(code,gen_random_uuid(),'qr');
  begin
    perform public.kotonoha_qr_file('begin_purge',own,item,jsonb_build_object('confirmId',item));
    raise exception 'ACTIVE_PURGE_ALLOWED';
  exception when others then if sqlerrm<>'NOT_TRASHED' then raise; end if; end;
  perform public.kotonoha_qr_lifecycle('trash',own,item);
  begin
    perform public.kotonoha_qr_file('public',null,null,jsonb_build_object('code',code));
    raise exception 'TRASH_VIEW_ALLOWED';
  exception when others then if sqlerrm<>'INACTIVE' then raise; end if; end;
  begin
    perform public.kotonoha_qr_lifecycle('purge',own,item,item);
    raise exception 'FILE_LEFT_BEHIND';
  exception when others then if sqlerrm<>'FILE_CLEANUP_REQUIRED' then raise; end if; end;
  assert exists(select 1 from kotonoha.qr_access_logs where link_id=item);
  perform public.kotonoha_qr_lifecycle('restore',own,item);
  assert public.kotonoha_qr_file('get',own,item)->>'state'='ready';
  perform public.kotonoha_qr('active',own,item,'{"active":true}');
  perform public.kotonoha_qr_lifecycle('trash',own,item);
  assert public.kotonoha_qr_file('begin_purge',other_owner,item,jsonb_build_object('confirmId',item)) is null;
  begin
    perform public.kotonoha_qr_file('begin_purge',own,item,'{}');
    raise exception 'UNCONFIRMED_PURGE_ALLOWED';
  exception when others then if sqlerrm<>'CONFIRM_REQUIRED' then raise; end if; end;
  perform public.kotonoha_qr_file('begin_purge',own,item,jsonb_build_object('confirmId',item));
  begin
    perform public.kotonoha_qr_lifecycle('restore',own,item);
    raise exception 'DELETION_RESTORE_RACE';
  exception when others then if sqlerrm<>'FILE_DELETING' then raise; end if; end;
  perform public.kotonoha_qr_file('removed',own,item);
  perform public.kotonoha_qr_lifecycle('purge',own,item,item);
  assert not exists(select 1 from kotonoha.qr_files where id=item);
  assert not exists(select 1 from kotonoha.qr_access_logs where link_id=item);
  assert not exists(select 1 from kotonoha.qr_links where id=item);
  for i in 1..25 loop
    perform public.kotonoha_qr_file('init',own,gen_random_uuid(),args);
  end loop;
  begin
    perform public.kotonoha_qr_file('init',own,gen_random_uuid(),args);
    raise exception 'QUOTA_BYPASSED';
  exception when others then if sqlerrm<>'FILE_QUOTA' then raise; end if; end;
  assert not has_function_privilege('anon','public.kotonoha_qr_file(text,uuid,uuid,jsonb)','execute');
  assert not has_function_privilege('authenticated','public.kotonoha_qr_file(text,uuid,uuid,jsonb)','execute');
  assert has_function_privilege('service_role','public.kotonoha_qr_file(text,uuid,uuid,jsonb)','execute');
  assert not has_table_privilege('anon','kotonoha.qr_files','select');
  assert (select not public from storage.buckets where id='marugo-qr-files');
end $test$;
rollback;

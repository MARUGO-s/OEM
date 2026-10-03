-- No emails or password changes. Random fixtures only; all changes roll back.
begin;
do $test$
declare
  v_admin uuid;
  v_user uuid := gen_random_uuid();
  v_unverified uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_id uuid := gen_random_uuid();
  v_store uuid;
  v_store2 uuid;
  v_legacy uuid;
  v_result jsonb;
begin
  select id into v_admin from auth.users where lower(email)='pingus0428@gmail.com';
  select id into v_store from kotonoha.qr_stores where name='マルゴ四谷';
  select id into v_store2 from kotonoha.qr_stores where name='BISTRO CAVACAVA';
  select id into v_legacy from kotonoha.qr_stores where legacy;
  assert v_store is not null and v_store2 is not null and v_legacy is not null;
  assert (select status='active' and role='admin' from kotonoha.qr_members where user_id=v_admin);
  assert (public.marugo_qr_accounts('scope',v_admin,v_legacy)->>'workspaceId')::uuid=v_legacy;
  assert not has_function_privilege('anon','public.marugo_qr_accounts(text,uuid,uuid,uuid,jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','public.marugo_qr_accounts(text,uuid,uuid,uuid,jsonb)','EXECUTE');
  assert not has_table_privilege('authenticated','kotonoha.qr_members','SELECT');
  assert not has_table_privilege('authenticated','kotonoha.qr_stores','UPDATE');
  assert (select bool_and(relrowsecurity) from pg_class where oid in ('kotonoha.qr_members'::regclass,'kotonoha.qr_stores'::regclass,'kotonoha.qr_account_audit'::regclass));
  assert jsonb_array_length(public.marugo_qr_accounts('stores_public')->'stores')=11;
  assert not exists(select 1 from jsonb_array_elements(public.marugo_qr_accounts('stores_public')->'stores') s where s->>'name'='未割当（旧QR）');
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (v_user,'qr-test-'||v_user||'@example.invalid',now(),jsonb_build_object('marugo_qr_store_id',v_store,'role','admin','status','active')),
    (v_unverified,'qr-test-'||v_unverified||'@example.invalid',null,jsonb_build_object('marugo_qr_store_id',v_store2)),
    (v_other,'qr-test-'||v_other||'@example.invalid',now(),jsonb_build_object('marugo_qr_store_id',v_legacy));
  assert (select role='member' and status='pending' and store_id=v_store from kotonoha.qr_members where user_id=v_user), 'Untrusted signup metadata must not grant access';
  assert exists(select 1 from kotonoha.qr_members where user_id=v_unverified and status='pending');
  assert not exists(select 1 from kotonoha.qr_members where user_id=v_other), 'Legacy store cannot be claimed';
  v_result := public.marugo_qr_accounts('context',v_user);
  assert jsonb_array_length(v_result->'stores')=0;
  assert v_result->'member'->>'store_name'='マルゴ四谷';
  begin
    perform public.marugo_qr_accounts('scope',v_user,v_store);
    raise exception 'PENDING_ACCESS_ALLOWED';
  exception when others then if sqlerrm <> 'ACCOUNT_PENDING_OR_SUSPENDED' then raise; end if; end;
  begin
    perform public.marugo_qr_accounts('update_member',v_admin,null,v_unverified,'{"action":"approve"}');
    raise exception 'UNVERIFIED_APPROVED';
  exception when others then if sqlerrm <> 'UNVERIFIED' then raise; end if; end;
  perform public.marugo_qr_accounts('update_member',v_admin,null,v_user,'{"action":"approve"}');
  assert (public.marugo_qr_accounts('scope',v_user)->>'workspaceId')::uuid=v_store;
  begin
    perform public.marugo_qr_accounts('scope',v_user,v_store2);
    raise exception 'CROSS_STORE_ALLOWED';
  exception when others then if sqlerrm <> 'STORE_FORBIDDEN' then raise; end if; end;
  begin
    perform public.marugo_qr_accounts('scope',v_user,v_legacy);
    raise exception 'LEGACY_ACCESS_ALLOWED';
  exception when others then if sqlerrm <> 'STORE_FORBIDDEN' then raise; end if; end;
  begin
    perform public.marugo_qr_accounts('members',v_user);
    raise exception 'MEMBER_DIRECTORY_ALLOWED';
  exception when others then if sqlerrm <> 'ADMIN_REQUIRED' then raise; end if; end;
  begin
    perform public.marugo_qr_accounts('update_member',v_user,null,v_admin,'{"action":"grant_admin"}');
    raise exception 'MEMBER_ESCALATION_ALLOWED';
  exception when others then if sqlerrm <> 'ADMIN_REQUIRED' then raise; end if; end;
  perform public.marugo_qr_accounts('register',v_user,v_store2,null,'{"role":"admin","status":"active"}');
  assert (select role='member' and store_id=v_store from kotonoha.qr_members where user_id=v_user), 'Repeated registration cannot change permissions';
  perform public.kotonoha_qr('create',v_store,v_id,jsonb_build_object('code',substr(md5(v_id::text),1,12),'title','accounts fixture','targetUrl','https://example.com/'));
  assert (public.kotonoha_qr('list',v_store)->>'total')::integer>=1;
  assert not exists(select 1 from jsonb_array_elements(public.kotonoha_qr('list',v_store2)->'links') r where r->>'id'=v_id::text);
  perform public.marugo_qr_accounts('update_member',v_admin,null,v_user,'{"action":"grant_admin"}');
  assert (public.marugo_qr_accounts('scope',v_user,v_store2)->>'workspaceId')::uuid=v_store2;
  assert (public.marugo_qr_accounts('scope',v_user,v_legacy)->>'workspaceId')::uuid=v_legacy;
  assert (public.marugo_qr_accounts('members',v_user)->>'total')::integer>=3;
  begin
    perform public.marugo_qr_accounts('update_member',v_user,null,v_user,'{"action":"suspend"}');
    raise exception 'SELF_CHANGE_ALLOWED';
  exception when others then if sqlerrm <> 'SELF_PROTECTED' then raise; end if; end;
  perform public.marugo_qr_accounts('update_member',v_admin,null,v_user,'{"action":"revoke_admin"}');
  begin
    perform public.marugo_qr_accounts('scope',v_user,v_store2);
    raise exception 'DEMOTED_ADMIN_ALLOWED';
  exception when others then if sqlerrm <> 'STORE_FORBIDDEN' then raise; end if; end;
  perform public.marugo_qr_accounts('update_member',v_admin,v_store2,v_user,'{"action":"assign_store"}');
  assert (public.marugo_qr_accounts('scope',v_user)->>'workspaceId')::uuid=v_store2;
  perform public.marugo_qr_accounts('update_member',v_admin,null,v_user,'{"action":"suspend"}');
  begin
    perform public.marugo_qr_accounts('scope',v_user,v_store2);
    raise exception 'SUSPENDED_ALLOWED';
  exception when others then if sqlerrm <> 'ACCOUNT_PENDING_OR_SUSPENDED' then raise; end if; end;
  assert (select count(*) from kotonoha.qr_account_audit where target_id=v_user)=5;
  update auth.users set banned_until=now()+interval '1 day' where id=v_user;
  begin
    perform public.marugo_qr_accounts('context',v_user);
    raise exception 'BANNED_ALLOWED';
  exception when others then if sqlerrm <> 'UNVERIFIED' then raise; end if; end;
end;
$test$;
rollback;

-- QR-only permissions. No changes to other apps' profiles, Auth or policies.
create table kotonoha.qr_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 1 and 80),
  active boolean not null default true,
  legacy boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index qr_one_legacy_store on kotonoha.qr_stores(legacy) where legacy;
-- Preserve all old owners, public codes, storage paths and logs unchanged.
insert into kotonoha.qr_stores(id,name,legacy)
  select workspace_id,'未割当（旧QR）',true from kotonoha.access_config where singleton;
insert into kotonoha.qr_stores(name) values
  ('BAR PELOTA'),('BISTRO CAVACAVA'),('Claudia2'),('MARUGO'),('MARUGO GRANDE'),
  ('MARUGO-D'),('MARUGO-OTTO'),('MARUGO2'),('MITAN'),('SOBA-JU'),('マルゴ四谷');
create table kotonoha.qr_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid references kotonoha.qr_stores(id),
  status text not null default 'pending' check(status in ('pending','active','suspended')),
  role text not null default 'member' check(role in ('member','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role='admin' or store_id is not null)
);
create index qr_members_store_idx on kotonoha.qr_members(store_id,status);
create table kotonoha.qr_account_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  target_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
alter table kotonoha.qr_stores enable row level security;
alter table kotonoha.qr_members enable row level security;
alter table kotonoha.qr_account_audit enable row level security;
revoke all on kotonoha.qr_stores,kotonoha.qr_members,kotonoha.qr_account_audit from public,anon,authenticated;
-- Record requested affiliation at signup even before email confirmation. Metadata
-- is only an untrusted request; the trigger can never activate or grant admin.
create function kotonoha.record_qr_signup() returns trigger
language plpgsql security definer set search_path='' as $trigger$
declare v_store uuid;
begin
  if coalesce(new.raw_user_meta_data->>'marugo_qr_store_id','')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select id into v_store from kotonoha.qr_stores where active and not legacy
      and id=(new.raw_user_meta_data->>'marugo_qr_store_id')::uuid;
    if v_store is not null then
      insert into kotonoha.qr_members(user_id,store_id,status,role)
        values(new.id,v_store,'pending','member') on conflict(user_id) do nothing;
    end if;
  end if;
  return new;
end;
$trigger$;
revoke all on function kotonoha.record_qr_signup() from public,anon,authenticated;
create trigger marugo_qr_signup after insert on auth.users
  for each row execute function kotonoha.record_qr_signup();
-- Bootstrap only the verified, existing account specified by the owner.
do $bootstrap$
begin
  if (select count(*) from auth.users where lower(email)='pingus0428@gmail.com'
      and email_confirmed_at is not null and deleted_at is null) <> 1 then
    raise exception 'VERIFIED_ADMIN_REQUIRED';
  end if;
  insert into kotonoha.qr_members(user_id,status,role)
    select id,'active','admin' from auth.users where lower(email)='pingus0428@gmail.com'
    and email_confirmed_at is not null and deleted_at is null;
  insert into kotonoha.qr_account_audit(actor_id,target_id,action,after_data)
    select user_id,user_id,'bootstrap_admin',to_jsonb(m) from kotonoha.qr_members m where role='admin';
end;
$bootstrap$;

-- Called only by Edge, with actor UUID obtained from Auth getUser(), never the request body.
create function public.marugo_qr_accounts(
  p_operation text, p_actor uuid default null, p_store uuid default null,
  p_target uuid default null, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_actor kotonoha.qr_members%rowtype;
  v_before kotonoha.qr_members%rowtype;
  v_after kotonoha.qr_members%rowtype;
  v_store kotonoha.qr_stores%rowtype;
  v_rows jsonb;
  v_action text := p_payload->>'action';
  v_page integer := greatest(0,least(100000,coalesce((p_payload->>'page')::integer,0)));
begin
  if p_operation='stores_public' then
    select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name),'[]'::jsonb)
      into v_rows from kotonoha.qr_stores s where active and not legacy;
    return jsonb_build_object('stores',v_rows);
  end if;
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor
    and email_confirmed_at is not null and deleted_at is null
    and (banned_until is null or banned_until <= now())) then
    raise exception 'UNVERIFIED' using errcode='42501';
  end if;
  select * into v_actor from kotonoha.qr_members where user_id=p_actor;
  if p_operation='register' then
    if v_actor.user_id is null then
      select * into v_store from kotonoha.qr_stores where id=p_store and active and not legacy;
      if not found then raise exception 'INVALID_STORE'; end if;
      insert into kotonoha.qr_members(user_id,store_id) values(p_actor,p_store) on conflict(user_id) do nothing;
      -- A registration must never activate or grant an existing account.
    end if;
    return public.marugo_qr_accounts('context',p_actor);
  end if;
  if p_operation='context' then
    select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'legacy',s.legacy) order by s.legacy,s.name),'[]'::jsonb)
      into v_rows from kotonoha.qr_stores s where s.active
        and v_actor.status='active' and (v_actor.role='admin' or (s.id=v_actor.store_id and not s.legacy));
    return jsonb_build_object('member',case when v_actor.user_id is null then null else to_jsonb(v_actor) || jsonb_build_object('store_name',(select name from kotonoha.qr_stores where id=v_actor.store_id)) end,
      'stores',v_rows,'email',(select email from auth.users where id=p_actor));
  end if;
  if v_actor.user_id is null or v_actor.status <> 'active' then
    raise exception 'ACCOUNT_PENDING_OR_SUSPENDED' using errcode='42501';
  end if;
  if p_operation='scope' then
    select * into v_store from kotonoha.qr_stores where id=coalesce(p_store,
      case when v_actor.role='member' then v_actor.store_id end) and active;
    if not found or (v_actor.role <> 'admin' and (v_store.id <> v_actor.store_id or v_store.legacy)) then
      raise exception 'STORE_FORBIDDEN' using errcode='42501';
    end if;
    return jsonb_build_object('workspaceId',v_store.id,'storeName',v_store.name);
  end if;
  if v_actor.role <> 'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_operation='members' then
    select coalesce(jsonb_agg(row_to_json(r) order by r.created_at desc,r.user_id),'[]'::jsonb) into v_rows from (
      select m.*,u.email,u.email_confirmed_at is not null as email_verified,s.name as store_name
      from kotonoha.qr_members m join auth.users u on u.id=m.user_id
      left join kotonoha.qr_stores s on s.id=m.store_id
      where p_store is null or m.store_id=p_store
      order by m.created_at desc,m.user_id limit 50 offset v_page*50
    ) r;
    return jsonb_build_object('members',v_rows,'total',(select count(*) from kotonoha.qr_members where p_store is null or store_id=p_store));
  end if;
  if p_operation='update_member' then
    -- Serialize status/role changes so concurrent admins cannot remove the last admin.
    perform pg_advisory_xact_lock(hashtextextended('marugo-qr-admin',76191));
    -- Recheck actor after waiting for the lock: a suspended/demoted actor cannot mutate.
    select * into v_actor from kotonoha.qr_members where user_id=p_actor;
    if v_actor.user_id is null or v_actor.status <> 'active' or v_actor.role <> 'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
    if p_target=p_actor then raise exception 'SELF_PROTECTED'; end if;
    select * into v_before from kotonoha.qr_members where user_id=p_target for update;
    if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
    if v_action not in ('approve','suspend','grant_admin','revoke_admin','assign_store') or v_action is null then raise exception 'INVALID_ACTION'; end if;
    if v_action in ('approve','grant_admin') and not exists(select 1 from auth.users where id=p_target
        and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<=now())) then
      raise exception 'UNVERIFIED';
    end if;
    if v_action='grant_admin' and v_before.status <> 'active' then raise exception 'APPROVE_FIRST'; end if;
    if v_action in ('suspend','revoke_admin') and v_before.role='admin' and v_before.status='active'
      and (select count(*) from kotonoha.qr_members m join auth.users u on u.id=m.user_id
        where m.role='admin' and m.status='active' and u.deleted_at is null and u.email_confirmed_at is not null
        and (u.banned_until is null or u.banned_until<=now())) <= 1 then raise exception 'LAST_ADMIN'; end if;
    if v_action='assign_store' then
      if not exists(select 1 from kotonoha.qr_stores where id=p_store and active and not legacy) then raise exception 'INVALID_STORE'; end if;
      update kotonoha.qr_members set store_id=p_store,updated_at=now() where user_id=p_target;
    elsif v_action='revoke_admin' then
      if v_before.store_id is null then raise exception 'STORE_REQUIRED'; end if;
      update kotonoha.qr_members set role='member',updated_at=now() where user_id=p_target;
    elsif v_action='grant_admin' then
      update kotonoha.qr_members set role='admin',updated_at=now() where user_id=p_target;
    else
      update kotonoha.qr_members set status=case when v_action='approve' then 'active' else 'suspended' end,updated_at=now() where user_id=p_target;
    end if;
    select * into v_after from kotonoha.qr_members where user_id=p_target;
    insert into kotonoha.qr_account_audit(actor_id,target_id,action,before_data,after_data)
      values(p_actor,p_target,v_action,to_jsonb(v_before),to_jsonb(v_after));
    return to_jsonb(v_after);
  end if;
  raise exception 'INVALID_OPERATION';
end;
$function$;
revoke all on function public.marugo_qr_accounts(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.marugo_qr_accounts(text,uuid,uuid,uuid,jsonb) to service_role;

-- Private storage: only this gateway grants short-lived, public viewing links.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('marugo-qr-files','marugo-qr-files',false,20971520,array['application/pdf','image/jpeg','image/png']);
create table kotonoha.qr_files (
  id uuid primary key,
  -- Shared-session workspace IDs are logical IDs, not Supabase Auth users.
  owner_id uuid not null,
  link_id uuid unique references kotonoha.qr_links(id) on delete cascade,
  title text not null check(length(title) between 1 and 120),
  file_name text not null check(length(file_name) between 1 and 180),
  mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),
  size bigint not null check(size between 1 and 20971520),
  path text not null unique,
  state text not null default 'pending' check(state in ('pending','ready','deleting','removed')),
  created_at timestamptz not null default now()
);
create index qr_files_owner_idx on kotonoha.qr_files(owner_id);
alter table kotonoha.qr_files enable row level security;
revoke all on kotonoha.qr_files from public,anon,authenticated;
grant all on kotonoha.qr_files to service_role;

-- Enforce cleanup even if an older API attempts a purge. Storage deletion is
-- performed by its API, never by deleting storage.objects rows in SQL.
create function kotonoha.qr_file_lifecycle_guard() returns trigger
language plpgsql set search_path='' as $$
declare v_state text;
begin
  select state into v_state from kotonoha.qr_files where link_id=old.id;
  if tg_op='DELETE' then
    if v_state is not null and v_state <> 'removed' then raise exception 'FILE_CLEANUP_REQUIRED'; end if;
    return old;
  end if;
  if v_state in ('deleting','removed') and (new.active or new.deleted_at is null) then raise exception 'FILE_DELETING'; end if;
  return new;
end $$;
revoke all on function kotonoha.qr_file_lifecycle_guard() from public,anon,authenticated;
create trigger qr_file_lifecycle_guard before update or delete on kotonoha.qr_links
for each row execute function kotonoha.qr_file_lifecycle_guard();

create function public.kotonoha_qr_file(p_operation text,p_owner uuid default null,p_id uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare f kotonoha.qr_files%rowtype; l kotonoha.qr_links%rowtype; ext text;
begin
  if p_operation='public' then
    select q.* into l from kotonoha.qr_links q where q.code=p_payload->>'code';
    if not found then raise exception 'NOT_FOUND'; end if;
    if not l.active or l.deleted_at is not null then raise exception 'INACTIVE'; end if;
    select * into f from kotonoha.qr_files where link_id=l.id and state='ready';
    if not found then raise exception 'NOT_FOUND'; end if;
    return to_jsonb(f);
  end if;
  if p_owner is null then raise exception 'OWNER_REQUIRED'; end if;
  if p_id is null then raise exception 'ID_REQUIRED'; end if;
  if p_operation='init' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,620));
    select * into f from kotonoha.qr_files where id=p_id and owner_id=p_owner for update;
    if found then
      if f.title is distinct from p_payload->>'title' or f.file_name is distinct from p_payload->>'fileName' or f.size is distinct from (p_payload->>'size')::bigint or f.mime is distinct from p_payload->>'mime' then raise exception 'REQUEST_CONFLICT'; end if;
      if f.state in ('deleting','removed') then raise exception 'FILE_DELETING'; end if;
      if f.link_id is not null then
        select * into l from kotonoha.qr_links where id=f.link_id and owner_id=p_owner;
        if l.deleted_at is not null then raise exception 'TRASHED'; end if;
        return jsonb_build_object('link',to_jsonb(l));
      end if;
      return to_jsonb(f);
    end if;
    if exists(select 1 from kotonoha.qr_links where id=p_id) or exists(select 1 from kotonoha.qr_files where id=p_id) then raise exception 'REQUEST_CONFLICT'; end if;
    -- Reserve the bucket maximum for incomplete uploads: a signed upload can
    -- contain up to 20MB even if the client claimed a smaller size.
    if coalesce((select sum(case when state='pending' then 20971520 else greatest(size,524288) end) from kotonoha.qr_files where owner_id=p_owner),0)+20971520 > 524288000 then raise exception 'FILE_QUOTA'; end if;
    ext := case p_payload->>'mime' when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else null end;
    if ext is null then raise exception 'INVALID_FILE'; end if;
    insert into kotonoha.qr_files(id,owner_id,title,file_name,mime,size,path)
    values(p_id,p_owner,p_payload->>'title',p_payload->>'fileName',p_payload->>'mime',(p_payload->>'size')::bigint,p_owner::text||'/'||p_id::text||'/file.'||ext) returning * into f;
    return to_jsonb(f);
  end if;
  -- The parent lock is acquired before the file lock, matching scan/lifecycle.
  select * into l from kotonoha.qr_links where id=p_id and owner_id=p_owner for update;
  select * into f from kotonoha.qr_files where id=p_id and owner_id=p_owner for update;
  if not found then return null; end if;
  if p_operation='get' then return to_jsonb(f); end if;
  if p_operation='complete' then
    if f.state in ('deleting','removed') then raise exception 'FILE_DELETING'; end if;
    if f.link_id is not null then
      if l.deleted_at is not null then raise exception 'TRASHED'; end if;
      return to_jsonb(l);
    end if;
    insert into kotonoha.qr_links(id,owner_id,code,title,target_url)
      values(f.id,p_owner,p_payload->>'code',f.title,p_payload->>'targetUrl') returning * into l;
    update kotonoha.qr_files set link_id=l.id,state='ready' where id=f.id;
    return to_jsonb(l);
  elsif p_operation='begin_purge' then
    if p_payload->>'confirmId' is distinct from p_id::text then raise exception 'CONFIRM_REQUIRED'; end if;
    if f.link_id is not null and l.deleted_at is null then raise exception 'NOT_TRASHED'; end if;
    update kotonoha.qr_files set state=case when state='removed' then 'removed' else 'deleting' end where id=f.id returning * into f;
    return to_jsonb(f);
  elsif p_operation='removed' then
    if f.state not in ('deleting','removed') then raise exception 'FILE_CLEANUP_REQUIRED'; end if;
    update kotonoha.qr_files set state='removed' where id=f.id;
    if f.link_id is null then delete from kotonoha.qr_files where id=f.id; end if;
    return jsonb_build_object('removed',true);
  end if;
  raise exception 'INVALID_OPERATION';
end $$;
revoke all on function public.kotonoha_qr_file(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kotonoha_qr_file(text,uuid,uuid,jsonb) to service_role;

-- Older scans remain unknown: their channel/referrer cannot be reconstructed.
alter table kotonoha.qr_access_logs
  add column source text not null default 'unknown' check (source in ('qr','button','link','unknown')),
  add column referrer_host text check (length(referrer_host) <= 253),
  add column device text not null default 'unknown' check (device in ('desktop','mobile','tablet','bot','unknown')),
  add column browser text not null default 'unknown' check (browser in ('chrome','safari','edge','firefox','other','unknown'));

create function public.kotonoha_qr_scan(
  p_code text, p_event uuid, p_source text default 'unknown',
  p_referrer_host text default null, p_device text default 'unknown',
  p_browser text default 'unknown', p_user_agent text default null
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_link kotonoha.qr_links%rowtype;
  v_inserted integer;
begin
  select * into v_link from kotonoha.qr_links where code=p_code for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if not v_link.active then raise exception 'INACTIVE' using errcode='P0001'; end if;
  insert into kotonoha.qr_access_logs(link_id,event_id,source,referrer_host,device,browser,user_agent)
    values(v_link.id,p_event,p_source,p_referrer_host,p_device,p_browser,left(p_user_agent,512))
    on conflict(link_id,event_id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=1 then
    update kotonoha.qr_links set scan_count=scan_count+1,last_accessed_at=now() where id=v_link.id;
  end if;
  return jsonb_build_object('targetUrl',v_link.target_url);
end;
$function$;
revoke all on function public.kotonoha_qr_scan(text,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.kotonoha_qr_scan(text,uuid,text,text,text,text,text) to service_role;

create function public.kotonoha_qr_history(p_owner uuid,p_id uuid,p_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare v_link kotonoha.qr_links%rowtype; v_events jsonb;
begin
  if p_owner is null then raise exception 'OWNER_REQUIRED'; end if;
  if p_page is null or p_page<0 or p_page>100000 then raise exception 'INVALID_PAGE'; end if;
  select * into v_link from kotonoha.qr_links where id=p_id and owner_id=p_owner;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.accessed_at desc,e.id desc),'[]'::jsonb) into v_events
    from (select id,accessed_at,user_agent,source,referrer_host,device,browser from kotonoha.qr_access_logs
      where link_id=p_id order by accessed_at desc,id desc limit 30 offset p_page*30) e;
  return jsonb_build_object('events',v_events,'total',v_link.scan_count);
end;
$function$;
revoke all on function public.kotonoha_qr_history(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.kotonoha_qr_history(uuid,uuid,integer) to service_role;

-- Read-only analytics for a single QR in the authenticated shared workspace.
-- Logs stay private; the Edge Function supplies the validated workspace ID.
create function public.kotonoha_qr_analytics(
  p_owner uuid, p_id uuid, p_days integer default 30, p_source text default 'all'
) returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_link kotonoha.qr_links%rowtype;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_start date;
  v_result jsonb;
begin
  if p_owner is null then raise exception 'OWNER_REQUIRED'; end if;
  if p_days is null or p_days not in (7,30,90) then raise exception 'INVALID_DAYS'; end if;
  if p_source is null or p_source not in ('all','qr','button','link','unknown') then raise exception 'INVALID_SOURCE'; end if;
  select * into v_link from kotonoha.qr_links where id=p_id and owner_id=p_owner;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  v_start := v_today - (p_days - 1);
  with events as materialized (
    select (a.accessed_at at time zone 'Asia/Tokyo')::date as day,
      a.source,a.device,a.browser,coalesce(a.referrer_host,'unknown') as referrer
    from kotonoha.qr_access_logs a
    where a.link_id=p_id
      and a.accessed_at >= (v_start::timestamp at time zone 'Asia/Tokyo')
      and a.accessed_at < ((v_today + 1)::timestamp at time zone 'Asia/Tokyo')
      and (p_source='all' or a.source=p_source)
  ), counts as (
    select day,count(*) as accesses from events
    group by 1
  ), daily as (
    select v_start + s.offset_days as day, coalesce(c.accesses,0) as accesses
    from generate_series(0,p_days-1) as s(offset_days)
    left join counts c on c.day=v_start+s.offset_days
  ), sources as (select source as key,count(*) as count from events group by source),
  devices as (select device as key,count(*) as count from events group by device),
  browsers as (select browser as key,count(*) as count from events group by browser),
  hosts_ranked as (
    select referrer,count(*) as count,row_number() over (order by count(*) desc,referrer) as position
    from events group by referrer
  ), hosts as (
    select case when position<=10 then referrer else 'other_hosts' end as key,sum(count) as count
    from hosts_ranked group by 1
  )
  select jsonb_build_object('linkId',p_id,'days',p_days,'source',p_source,
    'startDate',v_start,'endDate',v_today,
    'daily',(select jsonb_agg(jsonb_build_object('date',day,'count',accesses) order by day) from daily),
    'periodTotal',(select count(*) from events),
    'total',case when p_source='all' then v_link.scan_count else
      (select count(*) from kotonoha.qr_access_logs a where a.link_id=p_id and a.source=p_source) end,
    'generatedAt',now(),
    'sources',coalesce((select jsonb_agg(to_jsonb(s) order by count desc,key) from sources s),'[]'::jsonb),
    'devices',coalesce((select jsonb_agg(to_jsonb(d) order by count desc,key) from devices d),'[]'::jsonb),
    'browsers',coalesce((select jsonb_agg(to_jsonb(b) order by count desc,key) from browsers b),'[]'::jsonb),
    'referrers',coalesce((select jsonb_agg(to_jsonb(h) order by count desc,key) from hosts h),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.kotonoha_qr_analytics(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.kotonoha_qr_analytics(uuid,uuid,integer,text) to service_role;

-- Integration checks against the installed QR migration. All fixtures roll back.
begin;
do $test$
declare
  v_owner uuid := gen_random_uuid();
  v_id uuid := gen_random_uuid();
  v_code text := left(replace(gen_random_uuid()::text,'-',''),12);
  v_event uuid := gen_random_uuid();
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_data jsonb;
begin
  perform public.kotonoha_qr('create',v_owner,v_id,
    jsonb_build_object('code',v_code,'title','Analytics transaction fixture','targetUrl','https://example.com/'));
  v_data := public.kotonoha_qr_analytics(v_owner,v_id,7,'all');
  assert jsonb_array_length(v_data->'daily')=7;
  assert (v_data->>'periodTotal')::int=0;
  assert v_data->'sources'='[]'::jsonb;
  perform public.kotonoha_qr_scan(v_code,v_event,'button','shop.example','mobile','safari','fixture');
  perform public.kotonoha_qr_scan(v_code,v_event,'qr',null,'desktop','chrome','fixture');
  v_data := public.kotonoha_qr_analytics(v_owner,v_id,7,'all');
  assert (v_data->>'periodTotal')::int=1;
  assert v_data->'sources'->0->>'key'='button';
  assert v_data->'referrers'->0->>'key'='shop.example';
  insert into kotonoha.qr_access_logs(link_id,event_id,accessed_at,source)
    select v_id,gen_random_uuid(),((v_today-1)::timestamp at time zone 'Asia/Tokyo'),'qr'
    from generate_series(1,50);
  -- One second before the first Tokyo day is outside the 7-day window.
  insert into kotonoha.qr_access_logs(link_id,event_id,accessed_at,source)
    values(v_id,gen_random_uuid(),((v_today-6)::timestamp at time zone 'Asia/Tokyo')-interval '1 second','unknown');
  insert into kotonoha.qr_access_logs(link_id,event_id,source,referrer_host)
    select v_id,gen_random_uuid(),'button','host-'||n||'.example' from generate_series(1,12) n;
  update kotonoha.qr_links set scan_count=64 where id=v_id;
  v_data := public.kotonoha_qr_analytics(v_owner,v_id,7,'all');
  assert (v_data->>'periodTotal')::int=63;
  assert (v_data->>'total')::int=64;
  assert (v_data->'daily'->5->>'count')::int=50;
  assert (select sum((d->>'count')::int) from jsonb_array_elements(v_data->'daily') d)=63;
  assert (select sum((d->>'count')::int) from jsonb_array_elements(v_data->'referrers') d)=63;
  assert jsonb_array_length(v_data->'referrers')=11;
  assert exists(select 1 from jsonb_array_elements(v_data->'referrers') d where d->>'key'='other_hosts');
  v_data := public.kotonoha_qr_analytics(v_owner,v_id,7,'qr');
  assert (v_data->>'periodTotal')::int=50;
  assert (v_data->>'total')::int=50;
  assert jsonb_array_length(public.kotonoha_qr_history(v_owner,v_id,0)->'events')=30;
  assert jsonb_array_length(public.kotonoha_qr_history(v_owner,v_id,1)->'events')=30;
  assert jsonb_array_length(public.kotonoha_qr_history(v_owner,v_id,2)->'events')=4;
  v_data := public.kotonoha_qr_analytics(v_owner,v_id,90,'all');
  assert jsonb_array_length(v_data->'daily')=90;
  assert (v_data->>'periodTotal')::int=64;
  begin
    perform public.kotonoha_qr_analytics(gen_random_uuid(),v_id,7,'all');
    raise exception 'Owner isolation failed';
  exception when no_data_found then null;
  end;
  begin
    perform public.kotonoha_qr_history(gen_random_uuid(),v_id,0);
    raise exception 'History owner isolation failed';
  exception when no_data_found then null;
  end;
  assert not has_function_privilege('anon','public.kotonoha_qr_analytics(uuid,uuid,integer,text)','execute');
  assert not has_function_privilege('authenticated','public.kotonoha_qr_analytics(uuid,uuid,integer,text)','execute');
  assert not has_function_privilege('anon','public.kotonoha_qr_scan(text,uuid,text,text,text,text,text)','execute');
  assert not has_function_privilege('authenticated','public.kotonoha_qr_history(uuid,uuid,integer)','execute');
end;
$test$;
rollback;

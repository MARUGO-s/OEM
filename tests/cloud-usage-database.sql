begin;
do $$
declare
  owner_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  another_id uuid := gen_random_uuid();
  month_jst text := to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM');
  result jsonb;
begin
  if has_function_privilege('anon', 'public.kotonoha_usage(text,uuid,uuid,jsonb)', 'execute') or
     has_function_privilege('authenticated', 'public.kotonoha_usage(text,uuid,uuid,jsonb)', 'execute') or
     not has_function_privilege('service_role', 'public.kotonoha_usage(text,uuid,uuid,jsonb)', 'execute') then
    raise exception 'Usage RPC permissions invalid';
  end if;
  execute 'set local role service_role';
  perform public.kotonoha_usage('record', owner_a, null,
    jsonb_build_object('id', event_id, 'kind', 'minutes', 'model', 'gpt-6-sol', 'costUsd', 0.0125));
  perform public.kotonoha_usage('record', owner_a, null,
    jsonb_build_object('id', event_id, 'kind', 'minutes', 'model', 'gpt-6-sol', 'costUsd', 0.0125));
  perform public.kotonoha_usage('record', owner_b, null,
    jsonb_build_object('id', another_id, 'kind', 'transcription', 'model', 'gpt-transcribe', 'costUsd', 0.0045));
  result := public.kotonoha_usage('list', owner_a, null,
    jsonb_build_object('month', month_jst, 'page', 0));
  if (result->>'eventCount')::integer <> 1 or
     (result->>'totalUsd')::numeric <> 0.0125 or
     jsonb_array_length(result->'events') <> 1 then
    raise exception 'Usage count, price or idempotency failed';
  end if;
  result := public.kotonoha_usage('list', owner_b, null,
    jsonb_build_object('month', month_jst, 'page', 0));
  if (result->>'eventCount')::integer <> 1 or
     (result->>'totalUsd')::numeric <> 0.0045 then
    raise exception 'Workspace isolation failed';
  end if;
  execute 'reset role';
end $$;
rollback;

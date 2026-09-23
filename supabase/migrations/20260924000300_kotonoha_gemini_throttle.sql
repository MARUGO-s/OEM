-- Isolated workspace-wide Gemini gate. No changes to other apps, Auth or Storage.
create table kotonoha.gemini_throttle (
  owner_id uuid primary key,
  next_allowed_at timestamptz not null default '-infinity',
  active_run_id text,
  active_until timestamptz,
  reason text not null default 'spacing' check (reason in ('spacing','rate_limit'))
);
alter table kotonoha.gemini_throttle enable row level security;
revoke all on kotonoha.gemini_throttle from public, anon, authenticated;

create function public.kotonoha_gemini_gate(
  p_operation text, p_owner uuid, p_id uuid, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m kotonoha.meetings%rowtype;
  g kotonoha.gemini_throttle%rowtype;
  t timestamptz := clock_timestamp();
  delay_ms numeric;
begin
  if p_owner is null or nullif(p_payload->>'runId','') is null then raise exception 'NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 1477));
  select * into m from kotonoha.meetings where id=p_id and owner_id=p_owner and deleted_at is null;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into kotonoha.gemini_throttle(owner_id) values(p_owner) on conflict do nothing;
  select * into g from kotonoha.gemini_throttle where owner_id=p_owner for update;
  if p_operation='reserve' then
    if m.document->>'status'<>'transcribing' or m.document->>'runId' is distinct from p_payload->>'runId' then return null; end if;
    if g.active_run_id is not null and g.active_until>t then
      return jsonb_build_object('allowed',false,'until',greatest(g.next_allowed_at,t+interval '10 seconds'),'reason',g.reason);
    end if;
    if g.next_allowed_at>t then
      return jsonb_build_object('allowed',false,'until',g.next_allowed_at,'reason',g.reason);
    end if;
    update kotonoha.gemini_throttle set active_run_id=p_payload->>'runId', active_until=t+interval '6 minutes' where owner_id=p_owner;
    return jsonb_build_object('allowed',true);
  elsif p_operation='finish' then
    if g.active_run_id is distinct from p_payload->>'runId' then return null; end if;
    delay_ms := greatest(30000,least(86400000,coalesce((p_payload->>'delayMs')::numeric,30000)));
    update kotonoha.gemini_throttle set active_run_id=null, active_until=null,
      next_allowed_at=greatest(next_allowed_at,t+delay_ms*interval '1 millisecond'),
      reason=case when p_payload->>'reason'='rate_limit' then 'rate_limit' else 'spacing' end
      where owner_id=p_owner returning * into g;
    return jsonb_build_object('until',g.next_allowed_at,'reason',g.reason);
  end if;
  raise exception 'INVALID_OPERATION';
end $$;
revoke all on function public.kotonoha_gemini_gate(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kotonoha_gemini_gate(text,uuid,uuid,jsonb) to service_role;

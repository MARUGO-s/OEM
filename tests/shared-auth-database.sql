-- Only dedicated app state is touched, and every write is rolled back.
begin;
update kotonoha.access_config set login_id='test-shared', password_hash=extensions.crypt('test-only-password', extensions.gen_salt('bf', 4));
delete from kotonoha.login_attempts;
set local role service_role;
do $test$
declare
  a jsonb;
  b jsonb;
  token_a text := repeat('1',64);
  token_b text := repeat('2',64);
  ip text := repeat('3',64);
  meeting uuid := gen_random_uuid();
begin
  for i in 1..10 loop
    a := public.kotonoha_auth('login', jsonb_build_object('loginId','test-shared','password','wrong-password','tokenHash',token_a,'ipHash',ip));
    assert a->>'error' = 'INVALID_CREDENTIALS', 'incorrect password rejected';
  end loop;
  a := public.kotonoha_auth('login', jsonb_build_object('loginId','test-shared','password','test-only-password','tokenHash',token_a,'ipHash',ip));
  assert a->>'error' = 'RATE_LIMIT', 'persistent login limit';
  a := public.kotonoha_auth('login', jsonb_build_object('loginId','test-shared','password','test-only-password','tokenHash',token_a,'ipHash',repeat('4',64)));
  b := public.kotonoha_auth('login', jsonb_build_object('loginId','test-shared','password','test-only-password','tokenHash',token_b,'ipHash',repeat('5',64)));
  assert a->>'workspaceId' = b->>'workspaceId', 'two sessions use the same workspace';
  assert a->>'workspaceId' is not null, 'workspace must be set';
  perform public.kotonoha_store('create', (a->>'workspaceId')::uuid, meeting, '{"document":{"status":"done","isDemo":false,"title":"shared transaction test"}}');
  assert (public.kotonoha_store('get',(b->>'workspaceId')::uuid,meeting))->'document'->>'title' = 'shared transaction test', 'session B sees session A record';
  perform public.kotonoha_auth('logout',jsonb_build_object('tokenHash',token_a));
  assert (public.kotonoha_auth('session',jsonb_build_object('tokenHash',token_a)))->>'error' = 'INVALID_TOKEN', 'logout revokes session';
  assert (public.kotonoha_auth('session',jsonb_build_object('tokenHash',token_b)))->>'workspaceId' = b->>'workspaceId', 'other sessions stay logged in';
end;
$test$;
reset role;
update kotonoha.sessions set expires_at=now()-interval '1 second' where token_hash=repeat('2',64);
set local role service_role;
do $test$
begin
  assert (public.kotonoha_auth('session',jsonb_build_object('tokenHash',repeat('2',64))))->>'error' = 'INVALID_TOKEN', 'expired session rejected';
end;
$test$;
rollback;
select 'shared login, rate limit, shared data, revocation and expiry passed; changes rolled back' as result;

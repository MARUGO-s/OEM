-- Test only kotonoha, in a transaction that always rolls back. No Auth users.
begin;
set local role service_role;
do $test$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  meeting uuid := gen_random_uuid();
  doc jsonb;
  rejected boolean;
begin
  perform public.kotonoha_settings('put', a, null,
    '{"model":"gpt-6-astra","transcriptionModel":"gemini-3.5-transcribe","encryptedKey":"openai-envelope","encryptedGeminiKey":"gemini-envelope"}');
  perform public.kotonoha_settings('put', a, null,
    '{"model":"gpt-6-sol","transcriptionModel":"gpt-transcribe"}');
  doc := public.kotonoha_settings('get', a);
  assert doc->>'encryptedKey' = 'openai-envelope', 'OpenAI key must survive model changes';
  assert doc->>'encryptedGeminiKey' = 'gemini-envelope', 'Gemini key must survive model changes';
  assert doc->>'transcriptionModel' = 'gpt-transcribe', 'transcription model changes must persist';
  perform public.kotonoha_settings('put', a, null,
    '{"model":"gpt-6-luna","transcriptionModel":"gpt-transcribe"}');
  doc := public.kotonoha_settings('get', a);
  assert doc->>'model' = 'gpt-6-luna', 'Luna model must persist';

  perform public.kotonoha_store('settings_put', a, null, '{"model":"gpt-6-astra","encryptedKey":"test-envelope"}');
  perform public.kotonoha_store('settings_put', a, null, '{"model":"gpt-6-sol"}');
  doc := public.kotonoha_store('settings_get', a);
  assert doc->>'encryptedKey' = 'test-envelope', 'key must survive model changes';
  assert doc->>'model' = 'gpt-6-sol', 'model changes must persist';
  assert (public.kotonoha_store('settings_get', b))->>'encryptedKey' is null, 'settings owner isolation';

  perform public.kotonoha_store('create', a, meeting,
    '{"document":{"title":"transactional test","status":"analyzing","isDemo":false,"runId":"run-a","transcript":"preserved text"}}');
  assert jsonb_array_length(public.kotonoha_store('list', a)) = 1, 'created';
  assert jsonb_array_length(public.kotonoha_store('list', b)) = 0, 'list owner isolation';
  rejected := false;
  begin perform public.kotonoha_store('get', b, meeting); exception when no_data_found then rejected := true; end;
  assert rejected, 'get must reject another owner';
  rejected := false;
  begin perform public.kotonoha_store('patch', a, meeting, '{"title":"bad"}'); exception when raise_exception then rejected := SQLERRM = 'BUSY'; end;
  assert rejected, 'processing cannot be edited';
  rejected := false;
  begin perform public.kotonoha_store('settings_put', a, null, '{"model":"gpt-6-sol","encryptedKey":"changed"}'); exception when raise_exception then rejected := SQLERRM = 'BUSY'; end;
  assert rejected, 'key cannot change during processing';

  doc := public.kotonoha_store('job_update', a, meeting, '{"runId":"stale","patch":{"status":"done"}}');
  assert doc->'document'->>'status' = 'analyzing', 'stale worker must not overwrite';
  perform public.kotonoha_store('job_update', a, meeting, '{"runId":"run-a","patch":{"status":"done","markdown":"test minutes"}}');
  doc := public.kotonoha_store('patch', a, meeting, '{"markdown":"edited"}');
  assert doc->'document'->>'markdown' = 'edited', 'editing persists';
  assert doc->'document'->>'transcript' = 'preserved text', 'transcript preserved';
  rejected := false;
  begin perform public.kotonoha_store('delete', b, meeting); exception when no_data_found then rejected := true; end;
  assert rejected, 'delete owner isolation';
  perform public.kotonoha_store('delete', a, meeting);
  assert jsonb_array_length(public.kotonoha_store('list', a)) = 0, 'deleted meeting hidden';
end;
$test$;
rollback;
select 'kotonoha transaction checks passed; no test data retained' as result;

-- Kotonoha-only settings. Existing application schemas and records are untouched.
alter table kotonoha.settings
  add column transcription_model text not null default 'gpt-4o-transcribe'
    check (transcription_model in ('gpt-4o-transcribe', 'gemini-3.5-transcribe')),
  add column encrypted_gemini_key text;

create function public.kotonoha_settings(
  p_operation text, p_owner uuid, p_id uuid default null, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_owner is null then raise exception 'OWNER_REQUIRED'; end if;
  if p_operation = 'get' then
    select jsonb_build_object(
      'model', model,
      'encryptedKey', encrypted_key,
      'transcriptionModel', transcription_model,
      'encryptedGeminiKey', encrypted_gemini_key
    ) into result from kotonoha.settings where owner_id = p_owner;
    return coalesce(result, jsonb_build_object(
      'model', 'gpt-6-astra',
      'encryptedKey', null,
      'transcriptionModel', 'gpt-4o-transcribe',
      'encryptedGeminiKey', null
    ));
  elsif p_operation = 'put' then
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 1477));
    if (p_payload ? 'encryptedKey' or p_payload ? 'encryptedGeminiKey') and exists (
      select 1 from kotonoha.meetings where owner_id = p_owner and deleted_at is null
        and document->>'status' in ('transcribing','analyzing')
    ) then raise exception 'BUSY'; end if;
    insert into kotonoha.settings(
      owner_id, model, encrypted_key, transcription_model, encrypted_gemini_key
    ) values (
      p_owner,
      p_payload->>'model',
      p_payload->>'encryptedKey',
      p_payload->>'transcriptionModel',
      p_payload->>'encryptedGeminiKey'
    ) on conflict (owner_id) do update set
      model = excluded.model,
      transcription_model = excluded.transcription_model,
      encrypted_key = case when p_payload ? 'encryptedKey' then excluded.encrypted_key else kotonoha.settings.encrypted_key end,
      encrypted_gemini_key = case when p_payload ? 'encryptedGeminiKey' then excluded.encrypted_gemini_key else kotonoha.settings.encrypted_gemini_key end,
      updated_at = now();
    return public.kotonoha_settings('get', p_owner);
  end if;
  raise exception 'INVALID_OPERATION';
end $$;
revoke all on function public.kotonoha_settings(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kotonoha_settings(text,uuid,uuid,jsonb) to service_role;

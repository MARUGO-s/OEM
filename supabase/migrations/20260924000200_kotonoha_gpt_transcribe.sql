-- Migrate only kotonoha's isolated settings from the deprecated GPT-4o
-- transcription model to OpenAI's current file transcription model.
alter table kotonoha.settings
  drop constraint if exists settings_transcription_model_check;

alter table kotonoha.settings
  alter column transcription_model set default 'gpt-transcribe';

update kotonoha.settings
set transcription_model = 'gpt-transcribe', updated_at = now()
where transcription_model = 'gpt-4o-transcribe';

alter table kotonoha.settings
  add constraint settings_transcription_model_check
  check (transcription_model in ('gpt-transcribe', 'gemini-3.5-transcribe'));

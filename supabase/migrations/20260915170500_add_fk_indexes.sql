-- Cover foreign keys used during prompt-version and transcript cleanup.
create index interview_sessions_prompt_version
  on public.interview_sessions(prompt_version);

create index transcript_segments_turn
  on public.transcript_segments(session_id, turn_id);

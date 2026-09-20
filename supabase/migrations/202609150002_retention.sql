-- Supabase supports pg_cron. Run this migration after the core schema.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('mirai-discovery-retention', '17 * * * *',
  $$delete from public.interview_sessions where expires_at <= now()$$);
-- RLS hides expired data immediately; this removes rows and cascaded children hourly.

-- The production client now sends the opaque link token to v2. A stored hash
-- must never itself be accepted as the bearer credential.
drop function public.claim_interview_invitation(text, uuid);

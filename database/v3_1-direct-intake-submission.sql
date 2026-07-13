-- Smith Enterprises Tax Tracker Version 3.1
-- Direct GitHub Pages Walk-In Submission Migration
--
-- Run AFTER:
--   database/v2_1-role-permissions.sql
--   database/v3-walk-in-intake-migration.sql
--
-- This migration permits anonymous INSERT only into walk_in_intakes.
-- Anonymous users receive no SELECT, UPDATE, or DELETE access.

begin;

alter table public.walk_in_intakes
enable row level security;

-- Remove any prior anonymous policies if they exist.
drop policy if exists
"Anonymous users submit walk-in intakes"
on public.walk_in_intakes;

-- Grant only the table-level INSERT permission required by PostgREST.
grant insert
on public.walk_in_intakes
to anon;

-- Ensure anonymous users cannot retrieve or modify intake records.
revoke select, update, delete
on public.walk_in_intakes
from anon;

revoke all
on public.walk_in_intake_history
from anon;

revoke all
on public.intake_submission_limits
from anon;

-- INSERT policy:
--   - only new Submitted records
--   - no pre-matched client
--   - no staff review fields
--   - consent required
--   - verification flags must remain false
create policy
"Anonymous users submit walk-in intakes"
on public.walk_in_intakes
for insert
to anon
with check (
  status = 'Submitted'
  and matched_client_id is null
  and reviewed_at is null
  and reviewed_by is null
  and review_note is null
  and identity_verified = false
  and bank_information_verified = false
  and consent_received = true
  and first_name is not null
  and length(trim(first_name)) between 1 and 80
  and last_name is not null
  and length(trim(last_name)) between 1 and 80
  and email is not null
  and length(trim(email)) between 3 and 254
  and phone is not null
  and length(trim(phone)) between 7 and 20
  and address_line_1 is not null
  and length(trim(address_line_1)) between 1 and 160
  and city is not null
  and length(trim(city)) between 1 and 100
  and state is not null
  and state ~ '^[A-Z]{2}$'
  and postal_code is not null
  and length(trim(postal_code)) between 5 and 10
  and (
    drivers_license_last_four is null
    or drivers_license_last_four ~ '^[A-Za-z0-9]{4}$'
  )
  and (
    routing_last_four is null
    or routing_last_four ~ '^[0-9]{4}$'
  )
  and (
    account_last_four is null
    or account_last_four ~ '^[0-9]{4}$'
  )
);

-- Active staff continue to have select access through the Version 3 policy.
-- Staff processing continues through process_walk_in_intake().

notify pgrst, 'reload schema';

commit;

-- Smith Enterprises Tax Tracker Version 4.1
-- Add encrypted Social Security number collection
--
-- Run AFTER database/v4-secure-sensitive-intake.sql

begin;

alter table public.walk_in_intakes
add column if not exists ssn_last_four text
check (
  ssn_last_four is null
  or ssn_last_four ~ '^[0-9]{4}$'
);

alter table public.walk_in_intake_sensitive
add column if not exists encrypted_social_security_number text;

alter table public.walk_in_intake_sensitive
add column if not exists social_security_number_iv text;

alter table public.walk_in_intake_sensitive
drop constraint if exists walk_in_intake_sensitive_ssn_required;

alter table public.walk_in_intake_sensitive
add constraint walk_in_intake_sensitive_ssn_required
check (
  encrypted_social_security_number is not null
  and social_security_number_iv is not null
);

drop function if exists public.create_sensitive_walk_in_intake(
  jsonb,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date
);

create or replace function
public.create_sensitive_walk_in_intake(
  p_intake jsonb,
  p_encrypted_social_security_number text,
  p_social_security_number_iv text,
  p_encrypted_drivers_license text,
  p_drivers_license_iv text,
  p_encrypted_routing_number text,
  p_routing_number_iv text,
  p_encrypted_account_number text,
  p_account_number_iv text,
  p_key_version text,
  p_retention_delete_after date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intake_id uuid;
  v_intake_code text;
begin
  v_intake_code :=
    'WI-' ||
    to_char(current_date, 'YYYY') ||
    '-' ||
    upper(
      substr(
        replace(
          gen_random_uuid()::text,
          '-',
          ''
        ),
        1,
        8
      )
    );

  insert into public.walk_in_intakes (
    intake_code,
    status,
    first_name,
    middle_name,
    last_name,
    date_of_birth,
    business_name,
    client_type,
    email,
    phone,
    preferred_contact_method,
    address_line_1,
    address_line_2,
    city,
    state,
    postal_code,
    drivers_license_state,
    drivers_license_expiration,
    drivers_license_last_four,
    ssn_last_four,
    direct_deposit_requested,
    bank_name,
    bank_account_type,
    routing_last_four,
    account_last_four,
    consent_received,
    sensitive_data_received,
    sensitive_data_retention_until
  )
  values (
    v_intake_code,
    'Submitted',
    p_intake->>'first_name',
    nullif(p_intake->>'middle_name', ''),
    p_intake->>'last_name',
    nullif(p_intake->>'date_of_birth', '')::date,
    nullif(p_intake->>'business_name', ''),
    p_intake->>'client_type',
    p_intake->>'email',
    p_intake->>'phone',
    p_intake->>'preferred_contact_method',
    p_intake->>'address_line_1',
    nullif(p_intake->>'address_line_2', ''),
    p_intake->>'city',
    p_intake->>'state',
    p_intake->>'postal_code',
    nullif(p_intake->>'drivers_license_state', ''),
    nullif(p_intake->>'drivers_license_expiration', '')::date,
    right(p_intake->>'drivers_license_number', 4),
    right(p_intake->>'social_security_number', 4),
    coalesce(
      (p_intake->>'direct_deposit_requested')::boolean,
      false
    ),
    nullif(p_intake->>'bank_name', ''),
    nullif(p_intake->>'bank_account_type', ''),
    right(p_intake->>'routing_number', 4),
    right(p_intake->>'account_number', 4),
    true,
    true,
    p_retention_delete_after
  )
  returning id
  into v_intake_id;

  insert into public.walk_in_intake_sensitive (
    intake_id,
    encrypted_social_security_number,
    social_security_number_iv,
    encrypted_drivers_license,
    drivers_license_iv,
    encrypted_routing_number,
    routing_number_iv,
    encrypted_account_number,
    account_number_iv,
    key_version,
    retention_delete_after
  )
  values (
    v_intake_id,
    p_encrypted_social_security_number,
    p_social_security_number_iv,
    p_encrypted_drivers_license,
    p_drivers_license_iv,
    p_encrypted_routing_number,
    p_routing_number_iv,
    p_encrypted_account_number,
    p_account_number_iv,
    p_key_version,
    p_retention_delete_after
  );

  return jsonb_build_object(
    'intake_id',
    v_intake_id,
    'confirmation_code',
    v_intake_code
  );
end;
$$;

revoke all
on function public.create_sensitive_walk_in_intake(
  jsonb,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date
)
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

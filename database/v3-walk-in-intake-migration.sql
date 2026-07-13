-- Smith Enterprises Tax Tracker Version 3
-- Walk-In Intake Migration
--
-- This migration intentionally stores only the last four characters
-- of driver's-license and banking identifiers.
--
-- Run after v2.1 role permissions.

begin;

create extension if not exists pgcrypto;

-- Add approved contact/address fields to the client master record.
alter table public.clients
add column if not exists middle_name text;

alter table public.clients
add column if not exists address_line_1 text;

alter table public.clients
add column if not exists address_line_2 text;

alter table public.clients
add column if not exists city text;

alter table public.clients
add column if not exists state text;

alter table public.clients
add column if not exists postal_code text;

alter table public.clients
add column if not exists identity_information_verified boolean
not null default false;

alter table public.clients
add column if not exists bank_information_verified boolean
not null default false;

alter table public.clients
add column if not exists drivers_license_state text;

alter table public.clients
add column if not exists drivers_license_last_four text;

alter table public.clients
add column if not exists drivers_license_expiration date;

alter table public.clients
add column if not exists direct_deposit_requested boolean
not null default false;

alter table public.clients
add column if not exists bank_name text;

alter table public.clients
add column if not exists bank_account_type text;

alter table public.clients
add column if not exists routing_last_four text;

alter table public.clients
add column if not exists account_last_four text;

-- Intake queue.
create table if not exists public.walk_in_intakes (
  id uuid primary key default gen_random_uuid(),

  intake_code text not null unique,

  status text not null default 'Submitted'
    check (
      status in (
        'Submitted',
        'Under Review',
        'Possible Match',
        'Matched to Existing Client',
        'New Client Created',
        'Needs Correction',
        'Completed',
        'Rejected'
      )
    ),

  matched_client_id uuid
    references public.clients(id),

  first_name text not null,
  middle_name text,
  last_name text not null,
  business_name text,

  client_type text not null default 'Individual'
    check (
      client_type in (
        'Individual',
        'Business',
        'Nonprofit',
        'Other'
      )
    ),

  email text not null,
  phone text not null,

  preferred_contact_method text
    check (
      preferred_contact_method in (
        'Phone',
        'Email',
        'Text'
      )
    ),

  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  state text not null,
  postal_code text not null,

  drivers_license_state text,
  drivers_license_last_four text
    check (
      drivers_license_last_four is null
      or length(drivers_license_last_four) = 4
    ),

  drivers_license_expiration date,

  direct_deposit_requested boolean
    not null default false,

  bank_name text,

  bank_account_type text
    check (
      bank_account_type is null
      or bank_account_type in (
        'Checking',
        'Savings'
      )
    ),

  routing_last_four text
    check (
      routing_last_four is null
      or routing_last_four ~ '^[0-9]{4}$'
    ),

  account_last_four text
    check (
      account_last_four is null
      or account_last_four ~ '^[0-9]{4}$'
    ),

  identity_verified boolean
    not null default false,

  bank_information_verified boolean
    not null default false,

  consent_received boolean
    not null default false,

  review_note text,

  submitted_at timestamptz
    not null default now(),

  reviewed_at timestamptz,

  reviewed_by uuid
    references public.profiles(id),

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now()
);

create index if not exists
walk_in_intakes_status_idx
on public.walk_in_intakes(status);

create index if not exists
walk_in_intakes_email_idx
on public.walk_in_intakes(lower(email));

create index if not exists
walk_in_intakes_phone_idx
on public.walk_in_intakes(phone);

create index if not exists
walk_in_intakes_submitted_at_idx
on public.walk_in_intakes(submitted_at desc);

create index if not exists
walk_in_intakes_matched_client_idx
on public.walk_in_intakes(matched_client_id);

-- Intake audit history.
create table if not exists
public.walk_in_intake_history (
  id uuid primary key default gen_random_uuid(),

  intake_id uuid not null
    references public.walk_in_intakes(id)
    on delete cascade,

  action text not null,

  previous_status text,

  new_status text,

  note text,

  changed_by uuid
    references public.profiles(id),

  created_at timestamptz
    not null default now()
);

create index if not exists
walk_in_intake_history_intake_idx
on public.walk_in_intake_history(
  intake_id,
  created_at desc
);

-- Submission rate limiting.
create table if not exists
public.intake_submission_limits (
  id bigint generated always as identity
    primary key,

  ip_hash text not null,

  submitted_at timestamptz
    not null default now()
);

create index if not exists
intake_submission_limits_ip_time_idx
on public.intake_submission_limits(
  ip_hash,
  submitted_at desc
);

-- updated_at trigger.
drop trigger if exists
walk_in_intakes_set_updated_at
on public.walk_in_intakes;

create trigger walk_in_intakes_set_updated_at
before update on public.walk_in_intakes
for each row
execute function public.set_updated_at();

-- RLS.
alter table public.walk_in_intakes
enable row level security;

alter table public.walk_in_intake_history
enable row level security;

alter table public.intake_submission_limits
enable row level security;

-- No anonymous direct access.
revoke all
on public.walk_in_intakes
from anon;

revoke all
on public.walk_in_intake_history
from anon;

revoke all
on public.intake_submission_limits
from anon;

-- Authenticated staff may view intake records.
drop policy if exists
"Active employees view walk-in intakes"
on public.walk_in_intakes;

create policy
"Active employees view walk-in intakes"
on public.walk_in_intakes
for select
to authenticated
using (
  public.is_active_employee()
);

-- Authorized intake roles may update intake records.
drop policy if exists
"Authorized roles update walk-in intakes"
on public.walk_in_intakes;

create policy
"Authorized roles update walk-in intakes"
on public.walk_in_intakes
for update
to authenticated
using (
  public.has_any_role(
    array[
      'administrator',
      'office_manager',
      'senior_preparer',
      'preparer',
      'receptionist',
      'bookkeeper'
    ]
  )
)
with check (
  public.has_any_role(
    array[
      'administrator',
      'office_manager',
      'senior_preparer',
      'preparer',
      'receptionist',
      'bookkeeper'
    ]
  )
);

drop policy if exists
"Active employees view intake history"
on public.walk_in_intake_history;

create policy
"Active employees view intake history"
on public.walk_in_intake_history
for select
to authenticated
using (
  public.is_active_employee()
);

-- Intake processing RPC.
create or replace function
public.process_walk_in_intake(
  p_intake_id uuid,
  p_action text,
  p_selected_client_id uuid,
  p_review_status text,
  p_update_existing_client boolean,
  p_identity_verified boolean,
  p_bank_verified boolean,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intake public.walk_in_intakes%rowtype;
  v_previous_status text;
  v_new_status text;
  v_client_id uuid;
  v_client_number text;
  v_message text;
begin
  if not public.has_any_role(
    array[
      'administrator',
      'office_manager',
      'senior_preparer',
      'preparer',
      'receptionist',
      'bookkeeper'
    ]
  ) then
    raise exception
      'Your role cannot process walk-in intakes';
  end if;

  select *
  into v_intake
  from public.walk_in_intakes
  where id = p_intake_id
  for update;

  if not found then
    raise exception 'Walk-in intake not found';
  end if;

  v_previous_status := v_intake.status;
  v_new_status := coalesce(
    nullif(trim(p_review_status), ''),
    v_previous_status
  );

  if p_action = 'save_review' then
    update public.walk_in_intakes
    set
      status = v_new_status,
      identity_verified =
        coalesce(p_identity_verified, false),
      bank_information_verified =
        coalesce(p_bank_verified, false),
      review_note = p_review_note,
      reviewed_by = auth.uid(),
      reviewed_at = now()
    where id = p_intake_id;

    v_message := 'Intake review saved.';

  elsif p_action = 'match_existing' then
    if p_selected_client_id is null then
      raise exception 'Select an existing client';
    end if;

    if p_update_existing_client then
      update public.clients
      set
        first_name = v_intake.first_name,
        middle_name = v_intake.middle_name,
        last_name = v_intake.last_name,
        business_name = v_intake.business_name,
        client_type = v_intake.client_type,
        email = v_intake.email,
        phone = v_intake.phone,
        preferred_contact_method =
          v_intake.preferred_contact_method,
        address_line_1 = v_intake.address_line_1,
        address_line_2 = v_intake.address_line_2,
        city = v_intake.city,
        state = v_intake.state,
        postal_code = v_intake.postal_code,
        identity_information_verified =
          coalesce(p_identity_verified, false),
        bank_information_verified =
          coalesce(p_bank_verified, false),
        drivers_license_state =
          v_intake.drivers_license_state,
        drivers_license_last_four =
          v_intake.drivers_license_last_four,
        drivers_license_expiration =
          v_intake.drivers_license_expiration,
        direct_deposit_requested =
          v_intake.direct_deposit_requested,
        bank_name = v_intake.bank_name,
        bank_account_type =
          v_intake.bank_account_type,
        routing_last_four =
          v_intake.routing_last_four,
        account_last_four =
          v_intake.account_last_four
      where id = p_selected_client_id;
    end if;

    update public.walk_in_intakes
    set
      matched_client_id = p_selected_client_id,
      status = 'Matched to Existing Client',
      identity_verified =
        coalesce(p_identity_verified, false),
      bank_information_verified =
        coalesce(p_bank_verified, false),
      review_note = p_review_note,
      reviewed_by = auth.uid(),
      reviewed_at = now()
    where id = p_intake_id;

    v_client_id := p_selected_client_id;
    v_new_status := 'Matched to Existing Client';
    v_message := 'Intake matched to the existing client.';

  elsif p_action = 'create_client' then
    if not public.has_any_role(
      array[
        'administrator',
        'office_manager',
        'senior_preparer',
        'preparer',
        'receptionist'
      ]
    ) then
      raise exception
        'Your role cannot create clients';
    end if;

    v_client_number :=
      'SE-' ||
      to_char(current_date, 'YYYY') ||
      '-' ||
      lpad(
        nextval(
          'public.walk_in_client_number_seq'
        )::text,
        6,
        '0'
      );

    insert into public.clients (
      client_number,
      first_name,
      middle_name,
      last_name,
      business_name,
      phone,
      email,
      preferred_contact_method,
      client_type,
      active,
      address_line_1,
      address_line_2,
      city,
      state,
      postal_code,
      identity_information_verified,
      bank_information_verified,
      drivers_license_state,
      drivers_license_last_four,
      drivers_license_expiration,
      direct_deposit_requested,
      bank_name,
      bank_account_type,
      routing_last_four,
      account_last_four,
      created_by,
      notes
    )
    values (
      v_client_number,
      v_intake.first_name,
      v_intake.middle_name,
      v_intake.last_name,
      v_intake.business_name,
      v_intake.phone,
      v_intake.email,
      v_intake.preferred_contact_method,
      v_intake.client_type,
      true,
      v_intake.address_line_1,
      v_intake.address_line_2,
      v_intake.city,
      v_intake.state,
      v_intake.postal_code,
      coalesce(p_identity_verified, false),
      coalesce(p_bank_verified, false),
      v_intake.drivers_license_state,
      v_intake.drivers_license_last_four,
      v_intake.drivers_license_expiration,
      v_intake.direct_deposit_requested,
      v_intake.bank_name,
      v_intake.bank_account_type,
      v_intake.routing_last_four,
      v_intake.account_last_four,
      auth.uid(),
      'Created from walk-in intake ' ||
      v_intake.intake_code
    )
    returning id
    into v_client_id;

    update public.walk_in_intakes
    set
      matched_client_id = v_client_id,
      status = 'New Client Created',
      identity_verified =
        coalesce(p_identity_verified, false),
      bank_information_verified =
        coalesce(p_bank_verified, false),
      review_note = p_review_note,
      reviewed_by = auth.uid(),
      reviewed_at = now()
    where id = p_intake_id;

    v_new_status := 'New Client Created';
    v_message := 'New client created from the intake.';

  elsif p_action = 'complete' then
    update public.walk_in_intakes
    set
      status = 'Completed',
      identity_verified =
        coalesce(p_identity_verified, false),
      bank_information_verified =
        coalesce(p_bank_verified, false),
      review_note = p_review_note,
      reviewed_by = auth.uid(),
      reviewed_at = now()
    where id = p_intake_id;

    v_new_status := 'Completed';
    v_message := 'Intake completed.';

  else
    raise exception 'Invalid intake action';
  end if;

  insert into public.walk_in_intake_history (
    intake_id,
    action,
    previous_status,
    new_status,
    note,
    changed_by
  )
  values (
    p_intake_id,
    p_action,
    v_previous_status,
    v_new_status,
    p_review_note,
    auth.uid()
  );

  return jsonb_build_object(
    'message',
    v_message,
    'client_id',
    v_client_id,
    'status',
    v_new_status
  );
end;
$$;

-- Client-number sequence used for intake-created clients.
create sequence if not exists
public.walk_in_client_number_seq
start 1;

revoke all
on function public.process_walk_in_intake(
  uuid,
  text,
  uuid,
  text,
  boolean,
  boolean,
  boolean,
  text
)
from public;

grant execute
on function public.process_walk_in_intake(
  uuid,
  text,
  uuid,
  text,
  boolean,
  boolean,
  boolean,
  text
)
to authenticated;

notify pgrst, 'reload schema';

commit;

begin;

drop policy if exists "Anonymous users submit walk-in intakes" on public.walk_in_intakes;
drop policy if exists "Kiosk users submit walk-in intakes" on public.walk_in_intakes;
revoke insert on public.walk_in_intakes from anon;

alter table public.walk_in_intakes add column if not exists sensitive_data_received boolean not null default false;
alter table public.walk_in_intakes add column if not exists sensitive_data_retention_until date;

create table if not exists public.walk_in_intake_sensitive (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null unique references public.walk_in_intakes(id) on delete cascade,
  client_id uuid references public.clients(id),
  encrypted_drivers_license text not null,
  drivers_license_iv text not null,
  encrypted_routing_number text not null,
  routing_number_iv text not null,
  encrypted_account_number text not null,
  account_number_iv text not null,
  algorithm text not null default 'AES-GCM-256',
  key_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retention_delete_after date
);

create table if not exists public.walk_in_sensitive_access_log (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.walk_in_intakes(id),
  client_id uuid references public.clients(id),
  accessed_by uuid not null references public.profiles(id),
  access_reason text not null check(length(trim(access_reason)) >= 10),
  fields_revealed text[] not null,
  accessed_at timestamptz not null default now(),
  source_ip_hash text,
  user_agent_hash text
);

alter table public.walk_in_intake_sensitive enable row level security;
alter table public.walk_in_sensitive_access_log enable row level security;
revoke all on public.walk_in_intake_sensitive from anon, authenticated;
revoke insert, update, delete on public.walk_in_sensitive_access_log from anon, authenticated;
grant select on public.walk_in_sensitive_access_log to authenticated;

drop policy if exists "Authorized roles view sensitive access logs" on public.walk_in_sensitive_access_log;
create policy "Authorized roles view sensitive access logs"
on public.walk_in_sensitive_access_log for select to authenticated
using(public.has_any_role(array['administrator','office_manager','senior_preparer']));

create or replace function public.create_sensitive_walk_in_intake(
  p_intake jsonb,
  p_encrypted_drivers_license text,
  p_drivers_license_iv text,
  p_encrypted_routing_number text,
  p_routing_number_iv text,
  p_encrypted_account_number text,
  p_account_number_iv text,
  p_key_version text,
  p_retention_delete_after date
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_intake_id uuid; v_code text;
begin
  v_code := 'WI-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.walk_in_intakes(
    intake_code,status,first_name,middle_name,last_name,date_of_birth,business_name,client_type,email,phone,
    preferred_contact_method,address_line_1,address_line_2,city,state,postal_code,drivers_license_state,
    drivers_license_expiration,drivers_license_last_four,direct_deposit_requested,bank_name,bank_account_type,
    routing_last_four,account_last_four,consent_received,sensitive_data_received,sensitive_data_retention_until
  ) values (
    v_code,'Submitted',p_intake->>'first_name',nullif(p_intake->>'middle_name',''),p_intake->>'last_name',
    nullif(p_intake->>'date_of_birth','')::date,nullif(p_intake->>'business_name',''),p_intake->>'client_type',
    p_intake->>'email',p_intake->>'phone',p_intake->>'preferred_contact_method',p_intake->>'address_line_1',
    nullif(p_intake->>'address_line_2',''),p_intake->>'city',p_intake->>'state',p_intake->>'postal_code',
    nullif(p_intake->>'drivers_license_state',''),nullif(p_intake->>'drivers_license_expiration','')::date,
    right(p_intake->>'drivers_license_number',4),coalesce((p_intake->>'direct_deposit_requested')::boolean,false),
    nullif(p_intake->>'bank_name',''),nullif(p_intake->>'bank_account_type',''),right(p_intake->>'routing_number',4),
    right(p_intake->>'account_number',4),true,true,p_retention_delete_after
  ) returning id into v_intake_id;
  insert into public.walk_in_intake_sensitive(
    intake_id,encrypted_drivers_license,drivers_license_iv,encrypted_routing_number,routing_number_iv,
    encrypted_account_number,account_number_iv,key_version,retention_delete_after
  ) values (
    v_intake_id,p_encrypted_drivers_license,p_drivers_license_iv,p_encrypted_routing_number,p_routing_number_iv,
    p_encrypted_account_number,p_account_number_iv,p_key_version,p_retention_delete_after
  );
  return jsonb_build_object('intake_id',v_intake_id,'confirmation_code',v_code);
end;$$;

revoke all on function public.create_sensitive_walk_in_intake(jsonb,text,text,text,text,text,text,text,date) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;

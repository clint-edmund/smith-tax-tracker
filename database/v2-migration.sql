-- Smith Enterprises Tax Tracker v2 migration
-- Run in Supabase SQL Editor after backing up the database.

create extension if not exists pgcrypto;

-- Updated timestamps
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists tax_returns_set_updated_at on public.tax_returns;
create trigger tax_returns_set_updated_at
before update on public.tax_returns
for each row execute function public.set_updated_at();

-- Safe active-employee directory access.
-- Active employees need names and IDs for preparer assignment.
drop policy if exists "Active employees view active profile directory"
on public.profiles;

create policy "Active employees view active profile directory"
on public.profiles
for select
to authenticated
using (
  active = true
  and public.is_active_employee()
);

-- Existing self and administrator policies may remain.

-- Ensure active employees can view the main workflow tables.
drop policy if exists "Employees view clients" on public.clients;
create policy "Employees view clients"
on public.clients for select to authenticated
using (public.is_active_employee());

drop policy if exists "Employees view returns" on public.tax_returns;
create policy "Employees view returns"
on public.tax_returns for select to authenticated
using (public.is_active_employee());

drop policy if exists "Employees view status history" on public.status_history;
create policy "Employees view status history"
on public.status_history for select to authenticated
using (public.is_active_employee());

drop policy if exists "Employees view payments" on public.payments;
create policy "Employees view payments"
on public.payments for select to authenticated
using (public.is_active_employee());

-- Useful indexes
create index if not exists clients_email_idx
on public.clients(email);

create index if not exists clients_phone_idx
on public.clients(phone);

create index if not exists tax_returns_follow_up_idx
on public.tax_returns(follow_up_date);

create index if not exists tax_returns_balance_idx
on public.tax_returns(balance_due);

create index if not exists payments_payment_date_idx
on public.payments(payment_date);

-- Payment RPC
create or replace function public.record_return_payment(
  p_tax_return_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_reference_number text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_total_paid numeric(10,2);
begin
  if not public.is_active_employee() then
    raise exception 'Access denied';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  insert into public.payments (
    tax_return_id, payment_date, amount, payment_method,
    reference_number, received_by, notes
  )
  values (
    p_tax_return_id,
    coalesce(p_payment_date, current_date),
    p_amount,
    nullif(trim(p_payment_method), ''),
    nullif(trim(p_reference_number), ''),
    auth.uid(),
    nullif(trim(p_notes), '')
  )
  returning id into v_payment_id;

  select coalesce(sum(amount), 0)
  into v_total_paid
  from public.payments
  where tax_return_id = p_tax_return_id;

  update public.tax_returns
  set amount_paid = v_total_paid
  where id = p_tax_return_id;

  return v_payment_id;
end;
$$;

revoke all on function public.record_return_payment(
  uuid, date, numeric, text, text, text
) from public;

grant execute on function public.record_return_payment(
  uuid, date, numeric, text, text, text
) to authenticated;

-- Status RPC
create or replace function public.update_return_status(
  p_tax_return_id uuid,
  p_new_status text,
  p_change_note text,
  p_follow_up_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_status text;
begin
  if not public.is_active_employee() then
    raise exception 'Access denied';
  end if;

  select current_status
  into v_previous_status
  from public.tax_returns
  where id = p_tax_return_id;

  if v_previous_status is null then
    raise exception 'Tax return not found';
  end if;

  if p_new_status not in (
    'Documents Received','Initial Review','Missing Information',
    'Waiting for Client','Ready for Preparation','In Preparation',
    'Ready for Quality Review','Corrections Required',
    'Ready for Client Signature','Ready to File','E-Filed',
    'Federal Accepted','State Accepted','Rejected',
    'Amendment Required','Completed','On Hold','Cancelled'
  ) then
    raise exception 'Invalid return status';
  end if;

  update public.tax_returns
  set
    current_status = p_new_status,
    follow_up_date = p_follow_up_date,
    completed_date = case
      when p_new_status = 'Completed'
      then coalesce(completed_date, current_date)
      else completed_date
    end
  where id = p_tax_return_id;

  insert into public.status_history (
    tax_return_id, previous_status, new_status,
    change_note, changed_by
  )
  values (
    p_tax_return_id, v_previous_status, p_new_status,
    nullif(trim(p_change_note), ''), auth.uid()
  );
end;
$$;

revoke all on function public.update_return_status(
  uuid, text, text, date
) from public;

grant execute on function public.update_return_status(
  uuid, text, text, date
) to authenticated;

notify pgrst, 'reload schema';

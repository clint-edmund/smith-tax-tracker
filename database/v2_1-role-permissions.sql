-- Smith Enterprises Tax Tracker v2.1 role-based permissions
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('administrator','office_manager','senior_preparer','preparer','receptionist','bookkeeper','read_only'));

create or replace function public.current_user_role() returns text language sql stable security definer set search_path=public as $$
  select role from public.profiles where id=auth.uid() and active=true limit 1;
$$;
create or replace function public.has_any_role(allowed_roles text[]) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.current_user_role()=any(allowed_roles),false);
$$;
revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;
revoke all on function public.has_any_role(text[]) from public;
grant execute on function public.has_any_role(text[]) to authenticated;

alter table public.profiles enable row level security;
drop policy if exists "Employees view their own profile" on public.profiles;
drop policy if exists "Administrators view all profiles" on public.profiles;
drop policy if exists "Administrators update profiles" on public.profiles;
drop policy if exists "Active employees view active profile directory" on public.profiles;
create policy "Active employees view profile directory" on public.profiles for select to authenticated using (public.is_active_employee() and (active=true or id=auth.uid() or public.has_any_role(array['administrator','office_manager'])));
create policy "Administrators update profiles" on public.profiles for update to authenticated using (public.has_any_role(array['administrator'])) with check (public.has_any_role(array['administrator']));

alter table public.clients enable row level security;
drop policy if exists "Employees view clients" on public.clients;
drop policy if exists "Active employees view clients" on public.clients;
drop policy if exists "Employees create clients" on public.clients;
drop policy if exists "Authorized roles create clients" on public.clients;
drop policy if exists "Employees update clients" on public.clients;
drop policy if exists "Authorized roles update clients" on public.clients;
drop policy if exists "Administrators delete clients" on public.clients;
create policy "Active employees view clients" on public.clients for select to authenticated using (public.is_active_employee());
create policy "Authorized roles create clients" on public.clients for insert to authenticated with check (public.has_any_role(array['administrator','office_manager','senior_preparer','preparer','receptionist']) and created_by=auth.uid());
create policy "Authorized roles update clients" on public.clients for update to authenticated using (public.has_any_role(array['administrator','office_manager','senior_preparer','preparer','receptionist'])) with check (public.has_any_role(array['administrator','office_manager','senior_preparer','preparer','receptionist']));
create policy "Administrators delete clients" on public.clients for delete to authenticated using (public.has_any_role(array['administrator']));

alter table public.tax_returns enable row level security;
drop policy if exists "Employees view returns" on public.tax_returns;
drop policy if exists "Active employees view returns" on public.tax_returns;
drop policy if exists "Employees create returns" on public.tax_returns;
drop policy if exists "Authorized roles create returns" on public.tax_returns;
drop policy if exists "Employees update returns" on public.tax_returns;
drop policy if exists "Authorized roles update returns" on public.tax_returns;
drop policy if exists "Administrators delete returns" on public.tax_returns;
create policy "Active employees view returns" on public.tax_returns for select to authenticated using (public.is_active_employee());
create policy "Authorized roles create returns" on public.tax_returns for insert to authenticated with check (public.has_any_role(array['administrator','office_manager','senior_preparer','preparer']) and created_by=auth.uid());
create policy "Authorized roles update returns" on public.tax_returns for update to authenticated using (public.has_any_role(array['administrator','office_manager','senior_preparer','preparer'])) with check (public.has_any_role(array['administrator','office_manager','senior_preparer','preparer']));
create policy "Administrators delete returns" on public.tax_returns for delete to authenticated using (public.has_any_role(array['administrator']));

alter table public.status_history enable row level security;
drop policy if exists "Employees view status history" on public.status_history;
drop policy if exists "Active employees view status history" on public.status_history;
drop policy if exists "Employees create status history" on public.status_history;
create policy "Active employees view status history" on public.status_history for select to authenticated using (public.is_active_employee());
revoke insert on public.status_history from authenticated;

alter table public.payments enable row level security;
drop policy if exists "Employees view payments" on public.payments;
drop policy if exists "Active employees view payments" on public.payments;
drop policy if exists "Employees create payments" on public.payments;
drop policy if exists "Administrators update payments" on public.payments;
drop policy if exists "Financial roles update payments" on public.payments;
drop policy if exists "Administrators delete payments" on public.payments;
create policy "Active employees view payments" on public.payments for select to authenticated using (public.is_active_employee());
revoke insert on public.payments from authenticated;
create policy "Financial roles update payments" on public.payments for update to authenticated using (public.has_any_role(array['administrator','office_manager','bookkeeper'])) with check (public.has_any_role(array['administrator','office_manager','bookkeeper']));
create policy "Administrators delete payments" on public.payments for delete to authenticated using (public.has_any_role(array['administrator']));

create or replace function public.update_return_status(p_tax_return_id uuid,p_new_status text,p_change_note text,p_follow_up_date date) returns void language plpgsql security definer set search_path=public as $$
declare v_previous_status text; v_role text;
begin
 v_role:=public.current_user_role();
 if v_role not in ('administrator','office_manager','senior_preparer','preparer','receptionist') then raise exception 'Your role cannot update return status'; end if;
 if v_role='receptionist' and p_new_status not in ('Documents Received','Missing Information','Waiting for Client') then raise exception 'Receptionists may only use intake-related statuses'; end if;
 if p_new_status not in ('Documents Received','Initial Review','Missing Information','Waiting for Client','Ready for Preparation','In Preparation','Ready for Quality Review','Corrections Required','Ready for Client Signature','Ready to File','E-Filed','Federal Accepted','State Accepted','Rejected','Amendment Required','Completed','On Hold','Cancelled') then raise exception 'Invalid return status'; end if;
 select current_status into v_previous_status from public.tax_returns where id=p_tax_return_id;
 if not found then raise exception 'Tax return not found'; end if;
 update public.tax_returns set current_status=p_new_status,follow_up_date=p_follow_up_date,completed_date=case when p_new_status='Completed' then coalesce(completed_date,current_date) else completed_date end,updated_at=now() where id=p_tax_return_id;
 insert into public.status_history(tax_return_id,previous_status,new_status,change_note,changed_by,changed_at) values(p_tax_return_id,v_previous_status,p_new_status,nullif(trim(coalesce(p_change_note,'')),''),auth.uid(),now());
end; $$;
revoke all on function public.update_return_status(uuid,text,text,date) from public;
grant execute on function public.update_return_status(uuid,text,text,date) to authenticated;

create or replace function public.record_return_payment(p_tax_return_id uuid,p_payment_date date,p_amount numeric,p_payment_method text,p_reference_number text,p_notes text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_payment_id uuid; v_total_paid numeric(10,2);
begin
 if not public.has_any_role(array['administrator','office_manager','senior_preparer','preparer','receptionist','bookkeeper']) then raise exception 'Your role cannot record payments'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Payment amount must be greater than zero'; end if;
 if not exists(select 1 from public.tax_returns where id=p_tax_return_id) then raise exception 'Tax return not found'; end if;
 insert into public.payments(tax_return_id,payment_date,amount,payment_method,reference_number,received_by,notes) values(p_tax_return_id,coalesce(p_payment_date,current_date),p_amount,nullif(trim(coalesce(p_payment_method,'')),''),nullif(trim(coalesce(p_reference_number,'')),''),auth.uid(),nullif(trim(coalesce(p_notes,'')),'')) returning id into v_payment_id;
 select coalesce(sum(amount),0) into v_total_paid from public.payments where tax_return_id=p_tax_return_id;
 update public.tax_returns set amount_paid=v_total_paid,updated_at=now() where id=p_tax_return_id;
 return v_payment_id;
end; $$;
revoke all on function public.record_return_payment(uuid,date,numeric,text,text,text) from public;
grant execute on function public.record_return_payment(uuid,date,numeric,text,text,text) to authenticated;

alter table public.status_history drop constraint if exists status_history_changed_by_profile_fkey;
alter table public.status_history add constraint status_history_changed_by_profile_fkey foreign key(changed_by) references public.profiles(id);
alter table public.payments drop constraint if exists payments_received_by_profile_fkey;
alter table public.payments add constraint payments_received_by_profile_fkey foreign key(received_by) references public.profiles(id);
notify pgrst,'reload schema';
commit;

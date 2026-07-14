begin;

alter table public.clients
add column if not exists date_of_birth date;

alter table public.walk_in_intakes
add column if not exists date_of_birth date;

alter table public.clients
drop constraint if exists clients_date_of_birth_check;

alter table public.clients
add constraint clients_date_of_birth_check
check (
  date_of_birth is null
  or (
    date_of_birth >= date '1900-01-01'
    and date_of_birth <= current_date
  )
);

alter table public.walk_in_intakes
drop constraint if exists walk_in_intakes_date_of_birth_check;

alter table public.walk_in_intakes
add constraint walk_in_intakes_date_of_birth_check
check (
  date_of_birth is null
  or (
    date_of_birth >= date '1900-01-01'
    and date_of_birth <= current_date
  )
);

notify pgrst, 'reload schema';

commit;
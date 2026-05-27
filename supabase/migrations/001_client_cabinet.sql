-- =============================================================================
-- FitCRM: личный кабинет клиента (profiles, customers_db, visits, payments)
-- Выполните в Supabase → SQL Editor (целиком или по блокам).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Утилиты
-- -----------------------------------------------------------------------------

create or replace function public.normalize_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  d text;
begin
  d := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if d = '' then
    return '';
  end if;
  if length(d) = 11 and left(d, 1) = '8' then
    d := '7' || substring(d from 2);
  elsif length(d) = 10 then
    d := '7' || d;
  end if;
  return d;
end;
$$;

comment on function public.normalize_phone(text) is
  'Нормализация телефона к формату 7XXXXXXXXXX (РФ).';

-- Проверка whitelist при регистрации (без раскрытия всей таблицы customers_db)
create or replace function public.is_phone_in_customers_db(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers_db c
    where c.phone = public.normalize_phone(p_phone)
  );
$$;

grant execute on function public.is_phone_in_customers_db(text) to anon, authenticated;

-- Имя из whitelist (для подстановки в профиль при регистрации)
create or replace function public.get_customer_name_by_phone(p_phone text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.full_name
  from public.customers_db c
  where c.phone = public.normalize_phone(p_phone)
  limit 1;
$$;

grant execute on function public.get_customer_name_by_phone(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Таблицы
-- -----------------------------------------------------------------------------

create table if not exists public.customers_db (
  phone text primary key,
  full_name text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

comment on table public.customers_db is
  'Список телефонов, которым разрешена регистрация в личном кабинете.';

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text not null,
  full_name text not null default '',
  role text not null default 'client'
    check (role in ('client', 'admin')),
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint profiles_phone_normalized check (phone = public.normalize_phone(phone))
);

create unique index if not exists profiles_phone_uidx on public.profiles (phone);

comment on column public.profiles.balance is
  'Остаток занятий на абонементе клиента.';

create table if not exists public.visits (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists visits_user_created_idx
  on public.visits (user_id, created_at desc);

comment on table public.visits is
  'Журнал посещений клиента; created_at — дата и время визита.';

create table if not exists public.payments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists payments_user_created_idx
  on public.payments (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Триггеры: профиль после регистрации, списание баланса при визите
-- -----------------------------------------------------------------------------

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_name text;
  v_account text;
begin
  v_account := coalesce(new.raw_user_meta_data->>'account_type', '');
  if v_account <> 'client' then
    return new;
  end if;

  v_phone := public.normalize_phone(coalesce(new.raw_user_meta_data->>'phone', ''));
  if v_phone = '' then
    return new;
  end if;

  if not exists (select 1 from public.customers_db c where c.phone = v_phone) then
    raise exception 'PHONE_NOT_ALLOWED';
  end if;

  select c.full_name into v_name
  from public.customers_db c
  where c.phone = v_phone;

  insert into public.profiles (id, phone, full_name, role, balance)
  values (
    new.id,
    v_phone,
    coalesce(v_name, ''),
    'client',
    coalesce((new.raw_user_meta_data->>'initial_balance')::int, 0)
  )
  on conflict (id) do update
    set phone = excluded.phone,
        full_name = excluded.full_name,
        updated_at = timezone('utc'::text, now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_user_profile();

create or replace function public.enforce_visit_and_decrement_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_role text;
begin
  select p.balance, p.role into v_balance, v_role
  from public.profiles p
  where p.id = new.user_id;

  if v_role is distinct from 'client' and v_role is distinct from 'admin' then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if coalesce(v_balance, 0) <= 0 then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.profiles
  set balance = balance - 1,
      updated_at = timezone('utc'::text, now())
  where id = new.user_id;

  return new;
end;
$$;

drop trigger if exists visits_before_insert_balance on public.visits;
create trigger visits_before_insert_balance
  before insert on public.visits
  for each row
  execute function public.enforce_visit_and_decrement_balance();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.customers_db enable row level security;
alter table public.profiles enable row level security;
alter table public.visits enable row level security;
alter table public.payments enable row level security;

-- customers_db: клиенты не видят весь список; только админ
drop policy if exists "Admins manage customers_db" on public.customers_db;
create policy "Admins manage customers_db"
  on public.customers_db
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- profiles: свой профиль; админ — все
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

-- visits: только свои записи
drop policy if exists "Users select own visits" on public.visits;
create policy "Users select own visits"
  on public.visits
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert own visits" on public.visits;
create policy "Users insert own visits"
  on public.visits
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- payments: только свои (чтение); пополнение — админ или service role
drop policy if exists "Users select own payments" on public.payments;
create policy "Users select own payments"
  on public.payments
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins insert payments" on public.payments;
create policy "Admins insert payments"
  on public.payments
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- Примеры данных (раскомментируйте и подставьте тестовый телефон)
-- -----------------------------------------------------------------------------
-- insert into public.customers_db (phone, full_name)
-- values (public.normalize_phone('+7 (916) 123-45-67'), 'Анна Смирнова')
-- on conflict (phone) do update set full_name = excluded.full_name;

-- -----------------------------------------------------------------------------
-- Auth: вход по телефону + пароль
-- В приложении email вида: 79161234567@phone.fitcrm.local
-- В Supabase Dashboard → Authentication → Providers → Email:
--   при необходимости отключите «Confirm email» для быстрого теста.
-- -----------------------------------------------------------------------------

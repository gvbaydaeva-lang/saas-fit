-- =============================================================================
-- FitCRM: настройка личного кабинета (auth_token + портал)
-- Выполните ЦЕЛИКОМ в Supabase → SQL Editor → Run
--
-- ВАЖНО: отдельной таблицы "students" в проекте НЕТ.
-- Ученики (ФИО, телефон, абонемент, auth_token и т.д.) хранятся в колонке:
--   public.crm_studios.students  (тип jsonb — массив объектов)
--
-- НЕ выполняйте:  ALTER TABLE students ADD COLUMN auth_token ...
-- Это вызовет ошибку: relation "students" does not exist
-- =============================================================================

-- Проверка: посмотреть учеников в JSON (опционально)
-- select user_id, studio_name, jsonb_array_length(students) as cnt, students
-- from public.crm_studios limit 5;

-- -----------------------------------------------------------------------------
-- 1) Посещения CRM (если таблицы ещё нет)
-- -----------------------------------------------------------------------------
create table if not exists public.crm_visits (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  student_id bigint not null,
  visited_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists crm_visits_user_student_idx
  on public.crm_visits (user_id, student_id, visited_at desc);

alter table public.crm_visits enable row level security;

drop policy if exists "Owners manage crm_visits" on public.crm_visits;
create policy "Owners manage crm_visits"
  on public.crm_visits
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 2) Функция: добавить auth_token в каждый объект ученика в JSON-массиве
-- -----------------------------------------------------------------------------
create or replace function public.jsonb_backfill_student_auth_tokens(students jsonb)
returns jsonb
language plpgsql
volatile
as $$
declare
  result jsonb := '[]'::jsonb;
  elem jsonb;
  i int;
  len int;
begin
  if students is null or jsonb_typeof(students) <> 'array' then
    return coalesce(students, '[]'::jsonb);
  end if;

  len := jsonb_array_length(students);
  for i in 0 .. len - 1 loop
    elem := students -> i;
    if coalesce(elem ->> 'id', '') = '-8888' then
      result := result || jsonb_build_array(elem);
    elsif coalesce(trim(elem ->> 'auth_token'), '') = '' then
      result := result || jsonb_build_array(
        elem || jsonb_build_object('auth_token', gen_random_uuid()::text)
      );
    else
      result := result || jsonb_build_array(elem);
    end if;
  end loop;

  return result;
end;
$$;

-- Применить токены ко всем студиям
update public.crm_studios
set students = public.jsonb_backfill_student_auth_tokens(students)
where students is not null
  and jsonb_typeof(students) = 'array';

-- -----------------------------------------------------------------------------
-- 3) RPC для личного кабинета /portal/[auth_token]
-- -----------------------------------------------------------------------------
create or replace function public.portal_get_dashboard(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_student jsonb;
  v_sid bigint;
  v_visits jsonb;
  v_checked boolean;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN');
  end if;

  select cs.user_id, elem
  into v_owner, v_student
  from public.crm_studios cs,
       lateral jsonb_array_elements(cs.students) as elem
  where trim(coalesce(elem->>'auth_token', '')) = trim(p_token)
    and coalesce(elem->>'id', '') <> '-8888'
  limit 1;

  if v_owner is null or v_student is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  v_sid := (v_student->>'id')::bigint;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', v.id, 'visited_at', v.visited_at)
      order by v.visited_at desc
    ),
    '[]'::jsonb
  )
  into v_visits
  from (
    select id, visited_at
    from public.crm_visits
    where user_id = v_owner and student_id = v_sid
    order by visited_at desc
    limit 5
  ) v;

  select exists (
    select 1
    from public.crm_visits
    where user_id = v_owner
      and student_id = v_sid
      and (visited_at at time zone 'UTC')::date = (timezone('utc'::text, now()))::date
  )
  into v_checked;

  return jsonb_build_object(
    'ok', true,
    'owner_id', v_owner,
    'student', v_student,
    'visits', v_visits,
    'checked_in_today', v_checked
  );
end;
$$;

create or replace function public.portal_check_in(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_students jsonb;
  v_student jsonb;
  v_new_student jsonb;
  v_idx int;
  v_sid bigint;
  v_count int;
  v_visits int;
  v_until date;
  v_visits_out jsonb;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN');
  end if;

  select cs.user_id, cs.students
  into v_owner, v_students
  from public.crm_studios cs
  where exists (
    select 1
    from jsonb_array_elements(cs.students) elem
    where trim(coalesce(elem->>'auth_token', '')) = trim(p_token)
      and coalesce(elem->>'id', '') <> '-8888'
  )
  limit 1;

  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  v_idx := -1;
  for i in 0 .. jsonb_array_length(v_students) - 1 loop
    if trim(coalesce(v_students->i->>'auth_token', '')) = trim(p_token)
       and coalesce(v_students->i->>'id', '') <> '-8888' then
      v_student := v_students->i;
      v_idx := i;
      exit;
    end if;
  end loop;

  if v_idx < 0 then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  v_sid := (v_student->>'id')::bigint;

  if exists (
    select 1 from public.crm_visits
    where user_id = v_owner and student_id = v_sid
      and (visited_at at time zone 'UTC')::date = (timezone('utc'::text, now()))::date
  ) then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_TODAY');
  end if;

  if coalesce(v_student->>'abon', 'count') = 'count'
     and coalesce((v_student->>'count')::int, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'NO_LESSONS');
  end if;

  if coalesce(v_student->>'until', '') <> '' then
    v_until := (v_student->>'until')::date;
    if v_until < current_date then
      return jsonb_build_object('ok', false, 'error', 'EXPIRED');
    end if;
  end if;

  if coalesce(v_student->>'abon', 'count') = 'count' then
    v_count := greatest(0, coalesce((v_student->>'count')::int, 0) - 1);
  else
    v_count := coalesce((v_student->>'count')::int, 999);
  end if;

  v_visits := coalesce((v_student->>'visits')::int, 0) + 1;

  v_new_student := v_student
    || jsonb_build_object('count', v_count, 'visits', v_visits);

  v_students := jsonb_set(v_students, array[v_idx::text], v_new_student, false);

  update public.crm_studios
  set students = v_students
  where user_id = v_owner;

  insert into public.crm_visits (user_id, student_id, visited_at)
  values (v_owner, v_sid, timezone('utc'::text, now()));

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', v.id, 'visited_at', v.visited_at)
      order by v.visited_at desc
    ),
    '[]'::jsonb
  )
  into v_visits_out
  from (
    select id, visited_at
    from public.crm_visits
    where user_id = v_owner and student_id = v_sid
    order by visited_at desc
    limit 5
  ) v;

  return jsonb_build_object(
    'ok', true,
    'student', v_new_student,
    'visits', v_visits_out,
    'checked_in_today', true
  );
end;
$$;

grant execute on function public.portal_get_dashboard(text) to anon, authenticated;
grant execute on function public.portal_check_in(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4) Проверка после выполнения
-- -----------------------------------------------------------------------------
-- select
--   user_id,
--   elem->>'name' as student_name,
--   elem->>'auth_token' as auth_token
-- from public.crm_studios,
--      lateral jsonb_array_elements(students) as elem
-- where coalesce(elem->>'id', '') <> '-8888'
-- limit 20;

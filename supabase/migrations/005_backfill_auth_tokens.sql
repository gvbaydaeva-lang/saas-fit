-- auth_token в объекте ученика (JSON crm_studios.students)
-- Заполнение UUID для всех учеников, у которых токен ещё не задан

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

update public.crm_studios
set students = public.jsonb_backfill_student_auth_tokens(students)
where students is not null
  and jsonb_typeof(students) = 'array';

comment on function public.jsonb_backfill_student_auth_tokens(jsonb) is
  'Добавляет auth_token (uuid) каждому ученику в JSON-массиве, если поле пустое';

-- Автосоздание записи студии после регистрации в auth.users
-- Это устраняет сценарий "Профиль не найден" для новой учетной записи.

create or replace function public.handle_new_auth_user_create_crm_studio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  -- Для новых пользователей создаем базовую строку студии один раз.
  v_name := coalesce(new.raw_user_meta_data->>'studio_name', 'Моя Студия');

  insert into public.crm_studios (
    user_id,
    studio_name,
    studio_type,
    directions,
    students,
    teachers,
    schedule
  )
  values (
    new.id,
    v_name,
    'sport',
    '["Йога", "Фитнес", "Бокс", "Танцы", "Растяжка", "Пилатес"]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_crm_studio on auth.users;
create trigger on_auth_user_created_crm_studio
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user_create_crm_studio();

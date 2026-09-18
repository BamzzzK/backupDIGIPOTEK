-- Let staff sign in with a username while Supabase Auth keeps email as its identity provider.
alter table public.staff add column username text;

do $$
declare
  staff_row record;
  base_username text;
  candidate text;
begin
  for staff_row in
    select s.id, s.name, u.email
    from public.staff s
    join auth.users u on u.id = s.id
    order by s.created_at, s.id
  loop
    base_username := regexp_replace(lower(split_part(coalesce(staff_row.email, ''), '@', 1)), '[^a-z0-9._-]', '', 'g');
    if length(base_username) < 3 or base_username !~ '^[a-z0-9]' then
      base_username := regexp_replace(lower(staff_row.name), '[^a-z0-9._-]', '', 'g');
    end if;
    if length(base_username) < 3 or base_username !~ '^[a-z0-9]' then
      base_username := 'pegawai';
    end if;
    candidate := left(base_username, 23);
    if exists(select 1 from public.staff where lower(username) = candidate) then
      candidate := left(base_username, 23) || '-' || substr(replace(staff_row.id::text, '-', ''), 1, 8);
    end if;
    update public.staff set username = candidate where id = staff_row.id;
  end loop;
end $$;

alter table public.staff
  alter column username set not null,
  add constraint staff_username_format check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');
create unique index staff_username_lower_unique on public.staff(lower(username));

create or replace function private.new_staff() returns trigger
language plpgsql security definer set search_path = '' as $$
declare requested_username text;
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
  if requested_username = '' then
    requested_username := 'user-' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  if requested_username !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then
    raise exception 'Username harus 3-32 karakter dan hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung';
  end if;
  insert into public.staff(id, name, username)
  values(new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), 'Pegawai'), 120), requested_username);
  return new;
exception
  when unique_violation then
    raise exception 'Username sudah digunakan' using errcode = '23505';
end $$;

create function public.resolve_login_email(login_username text) returns text
language sql stable security definer set search_path = '' as $$
  select u.email::text
  from public.staff s
  join auth.users u on u.id = s.id
  where lower(s.username) = lower(trim(login_username))
  limit 1
$$;

revoke all on function public.resolve_login_email(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text) to service_role;

-- =========================================================================
-- تأمين النظام: باسوردات متشفرة (bcrypt)، تسجيل دخول على السيرفر بـ session token،
-- وقواعد RLS تمنع أي حد مش عامل login من القراية أو الكتابة.
-- الـ client بيبعت التوكن في هيدر x-mrc-session مع كل request.
-- =========================================================================

-- ===== Sessions & lock passwords (never exposed to the API) =====
create table if not exists public.app_sessions (
  token text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);
alter table public.app_sessions enable row level security;
revoke all on public.app_sessions from anon, authenticated;

create table if not exists public.app_locks (
  kind text primary key check (kind in ('treasury','whatsapp')),
  password_hash text not null
);
alter table public.app_locks enable row level security;
revoke all on public.app_locks from anon, authenticated;
insert into public.app_locks(kind, password_hash) values
  ('treasury', extensions.crypt('1234', extensions.gen_salt('bf'))),
  ('whatsapp', extensions.crypt('1234', extensions.gen_salt('bf')))
on conflict do nothing;

-- Move any old lock rows out of app_users, then hash remaining plaintext passwords
update public.app_locks l set password_hash = extensions.crypt(u.password_hash, extensions.gen_salt('bf'))
  from public.app_users u where u.email = l.kind || '@mrc.lock';
delete from public.app_users where email in ('treasury@mrc.lock','whatsapp@mrc.lock');
update public.app_users set password_hash = extensions.crypt(password_hash, extensions.gen_salt('bf'))
  where password_hash not like '$2%';

-- ===== Session helpers =====
create or replace function public.current_app_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.user_id from public.app_sessions s
  where s.token = nullif(current_setting('request.headers', true), '')::json->>'x-mrc-session'
    and s.expires_at > now()
$$;

create or replace function public.is_app_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.app_users u where u.id = public.current_app_user_id() and u.role = 'owner')
$$;

-- ===== Auth RPCs =====
create or replace function public.app_login(p_identifier text, p_password text) returns json
language plpgsql security definer set search_path = '' as $$
declare u public.app_users; t text;
begin
  select * into u from public.app_users
   where (lower(email) = lower(trim(p_identifier)) or lower(full_name) = lower(trim(p_identifier)))
     and password_hash = extensions.crypt(p_password, password_hash)
   limit 1;
  if u.id is null then
    perform pg_sleep(0.5);
    return null;
  end if;
  delete from public.app_sessions where expires_at < now();
  t := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.app_sessions(token, user_id) values (t, u.id);
  return json_build_object('token', t, 'user', json_build_object(
    'id', u.id, 'full_name', u.full_name, 'email', u.email, 'phone', u.phone, 'role', u.role, 'created_at', u.created_at));
end $$;

create or replace function public.app_me() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('id', id, 'full_name', full_name, 'email', email, 'phone', phone, 'role', role, 'created_at', created_at)
  from public.app_users where id = public.current_app_user_id()
$$;

create or replace function public.app_logout() returns void
language sql security definer set search_path = '' as $$
  delete from public.app_sessions
  where token = nullif(current_setting('request.headers', true), '')::json->>'x-mrc-session'
$$;

create or replace function public.app_update_profile(p_full_name text, p_email text, p_phone text, p_new_password text default null) returns json
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.current_app_user_id();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.app_users set full_name = p_full_name, email = p_email, phone = p_phone,
    password_hash = case when coalesce(p_new_password, '') = '' then password_hash
                         else extensions.crypt(p_new_password, extensions.gen_salt('bf')) end
  where id = uid;
  update public.employees set full_name = p_full_name, phone_whatsapp = p_phone where user_id = uid;
  return public.app_me();
end $$;

create or replace function public.app_create_user(p_full_name text, p_email text, p_phone text, p_password text, p_role text, p_base_salary numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.is_app_owner() then raise exception 'owner only'; end if;
  if p_role not in ('owner','employee') then raise exception 'invalid role'; end if;
  insert into public.app_users(full_name, email, phone, password_hash, role)
    values (p_full_name, p_email, p_phone, extensions.crypt(p_password, extensions.gen_salt('bf')), p_role)
    returning id into new_id;
  insert into public.employees(user_id, full_name, phone_whatsapp, base_salary)
    values (new_id, p_full_name, p_phone, p_base_salary);
  return new_id;
end $$;

create or replace function public.app_delete_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_owner() then raise exception 'owner only'; end if;
  if p_user_id = public.current_app_user_id() then raise exception 'cannot delete yourself'; end if;
  delete from public.employees where user_id = p_user_id;
  delete from public.app_users where id = p_user_id and role <> 'owner';
end $$;

create or replace function public.app_verify_lock(p_kind text, p_password text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.current_app_user_id(); ok boolean;
begin
  if uid is null then return false; end if;
  select exists(select 1 from public.app_locks where kind = p_kind and password_hash = extensions.crypt(p_password, password_hash))
      or exists(select 1 from public.app_users where role = 'owner' and password_hash = extensions.crypt(p_password, password_hash))
    into ok;
  if not ok then perform pg_sleep(0.5); end if;
  return ok;
end $$;

create or replace function public.app_set_lock_password(p_kind text, p_password text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_owner() then raise exception 'owner only'; end if;
  if coalesce(p_password, '') = '' then raise exception 'empty password'; end if;
  insert into public.app_locks(kind, password_hash) values (p_kind, extensions.crypt(p_password, extensions.gen_salt('bf')))
  on conflict (kind) do update set password_hash = excluded.password_hash;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.app_login(text,text), public.app_me(), public.app_logout(),
  public.app_update_profile(text,text,text,text), public.app_create_user(text,text,text,text,text,numeric),
  public.app_delete_user(uuid), public.app_verify_lock(text,text), public.app_set_lock_password(text,text),
  public.current_app_user_id(), public.is_app_owner() to anon, authenticated;

-- ===== app_users: no password column, no direct writes =====
revoke all on public.app_users from anon, authenticated;
grant select (id, full_name, email, phone, role, created_at) on public.app_users to anon, authenticated;

-- ===== RLS: replace the open policies =====
drop policy if exists "app full access" on public.app_users;
drop policy if exists "app full access" on public.employees;
drop policy if exists "app full access" on public.deals;
drop policy if exists "app full access" on public.employee_financials;
drop policy if exists "app full access" on public.treasury_transactions;
drop policy if exists "app full access" on public.whatsapp_instances;

create policy "logged in read" on public.app_users for select to anon, authenticated
  using ((select public.current_app_user_id()) is not null);

create policy "logged in read" on public.employees for select to anon, authenticated
  using ((select public.current_app_user_id()) is not null);
create policy "owner or self update" on public.employees for update to anon, authenticated
  using ((select public.is_app_owner()) or user_id = (select public.current_app_user_id()))
  with check ((select public.is_app_owner()) or user_id = (select public.current_app_user_id()));
create policy "owner delete" on public.employees for delete to anon, authenticated
  using ((select public.is_app_owner()));

create policy "logged in all" on public.deals for all to anon, authenticated
  using ((select public.current_app_user_id()) is not null)
  with check ((select public.current_app_user_id()) is not null);

create policy "logged in all" on public.whatsapp_instances for all to anon, authenticated
  using ((select public.current_app_user_id()) is not null)
  with check ((select public.current_app_user_id()) is not null);

create policy "logged in read" on public.employee_financials for select to anon, authenticated
  using ((select public.current_app_user_id()) is not null);
create policy "logged in insert" on public.employee_financials for insert to anon, authenticated
  with check ((select public.current_app_user_id()) is not null);
create policy "owner update" on public.employee_financials for update to anon, authenticated
  using ((select public.is_app_owner())) with check ((select public.is_app_owner()));
create policy "owner delete" on public.employee_financials for delete to anon, authenticated
  using ((select public.is_app_owner()));

create policy "logged in read" on public.treasury_transactions for select to anon, authenticated
  using ((select public.current_app_user_id()) is not null);
create policy "logged in insert" on public.treasury_transactions for insert to anon, authenticated
  with check ((select public.current_app_user_id()) is not null);
create policy "owner update" on public.treasury_transactions for update to anon, authenticated
  using ((select public.is_app_owner())) with check ((select public.is_app_owner()));
create policy "owner delete" on public.treasury_transactions for delete to anon, authenticated
  using ((select public.is_app_owner()));

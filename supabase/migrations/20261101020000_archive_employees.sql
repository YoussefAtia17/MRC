-- =========================================================================
-- حذف الموظف = أرشفة: الكارت والحساب بيختفوا ومايقدرش يدخل، لكن كل معاملاته
-- (سلف/بونص/ديلز/حركات خزنة) بتفضل في السجل، وتقدر ترجّعه تاني في أي وقت.
-- =========================================================================

alter table public.employees add column if not exists archived_at timestamptz;
alter table public.app_users add column if not exists archived_at timestamptz;
grant select (archived_at) on public.app_users to anon, authenticated;

-- مفيش حذف نهائي لكارت موظف (عشان السلف والبونص وحركات الخزنة ماتتمسحش معاه)
drop policy if exists "owner delete" on public.employees;
alter table public.employee_financials drop constraint employee_financials_employee_id_fkey,
  add constraint employee_financials_employee_id_fkey foreign key (employee_id) references public.employees(id) on delete restrict;

-- الحساب المؤرشف مايقدرش يدخل، وأي جلسة مفتوحة ليه بتقف
create or replace function public.current_app_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.user_id from public.app_sessions s
  join public.app_users u on u.id = s.user_id and u.archived_at is null
  where s.token = nullif(current_setting('request.headers', true), '')::json->>'x-mrc-session'
    and s.expires_at > now()
$$;

create or replace function public.app_login(p_identifier text, p_password text) returns json
language plpgsql security definer set search_path = '' as $$
declare u public.app_users; t text;
begin
  select * into u from public.app_users
   where (lower(email) = lower(trim(p_identifier)) or lower(full_name) = lower(trim(p_identifier)))
     and archived_at is null
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

create or replace function public.app_archive_employee(p_emp_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select user_id from public.employees where id = p_emp_id);
begin
  if not public.is_app_owner() then raise exception 'owner only'; end if;
  if uid is not null and uid = public.current_app_user_id() then raise exception 'cannot delete yourself'; end if;
  if exists(select 1 from public.app_users where id = uid and role = 'owner') then raise exception 'cannot delete an owner account'; end if;
  update public.employees set archived_at = now() where id = p_emp_id;
  if uid is not null then
    update public.app_users set archived_at = now() where id = uid;
    delete from public.app_sessions where user_id = uid;
  end if;
end $$;

create or replace function public.app_restore_employee(p_emp_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select user_id from public.employees where id = p_emp_id);
begin
  if not public.is_app_owner() then raise exception 'owner only'; end if;
  update public.employees set archived_at = null where id = p_emp_id;
  if uid is not null then update public.app_users set archived_at = null where id = uid; end if;
end $$;

-- الحذف من صفحة الحسابات بقى أرشفة برضه
create or replace function public.app_delete_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare emp uuid := (select id from public.employees where user_id = p_user_id limit 1);
begin
  if not public.is_app_owner() then raise exception 'owner only'; end if;
  if p_user_id = public.current_app_user_id() then raise exception 'cannot delete yourself'; end if;
  if exists(select 1 from public.app_users where id = p_user_id and role = 'owner') then raise exception 'cannot delete an owner account'; end if;
  if emp is not null then
    perform public.app_archive_employee(emp);
  else
    update public.app_users set archived_at = now() where id = p_user_id;
    delete from public.app_sessions where user_id = p_user_id;
  end if;
end $$;

revoke execute on function public.app_archive_employee(uuid), public.app_restore_employee(uuid) from public;
grant execute on function public.app_archive_employee(uuid), public.app_restore_employee(uuid) to anon, authenticated;

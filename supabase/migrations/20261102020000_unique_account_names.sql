-- =========================================================================
-- مايتعملش حسابين شغالين بنفس الاسم (الدخول بيبقى بالاسم، فالتكرار بيلخبط)
-- حتى لو الطلب اتبعت مرتين في نفس اللحظة.
-- =========================================================================

create or replace function public.app_create_user(p_full_name text, p_email text, p_phone text, p_password text, p_role text, p_base_salary numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.is_app_owner() then raise exception 'owner only'; end if;
  if p_role not in ('owner','employee') then raise exception 'invalid role'; end if;
  perform pg_advisory_xact_lock(hashtext('mrc_app_create_user'));
  if exists(select 1 from public.app_users where lower(trim(full_name)) = lower(trim(p_full_name)) and archived_at is null) then
    raise exception 'name taken';
  end if;
  insert into public.app_users(full_name, email, phone, password_hash, role)
    values (trim(p_full_name), p_email, p_phone, extensions.crypt(p_password, extensions.gen_salt('bf')), p_role)
    returning id into new_id;
  insert into public.employees(user_id, full_name, phone_whatsapp, base_salary)
    values (new_id, trim(p_full_name), p_phone, p_base_salary);
  return new_id;
end $$;

create or replace function public.app_restore_employee(p_emp_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select user_id from public.employees where id = p_emp_id);
begin
  if not public.is_app_owner() then raise exception 'owner only'; end if;
  if uid is not null and exists(
      select 1 from public.app_users a, public.app_users me
       where me.id = uid and a.id <> uid and a.archived_at is null
         and lower(trim(a.full_name)) = lower(trim(me.full_name))) then
    raise exception 'name taken';
  end if;
  update public.employees set archived_at = null where id = p_emp_id;
  if uid is not null then update public.app_users set archived_at = null where id = uid; end if;
end $$;

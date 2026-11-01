-- =========================================================================
-- سلامة الخزنة: كل حركات الصرف/الاسترجاع بتحصل على السيرفر (triggers) مع تشييك الرصيد،
-- حذف الديل أو السلفة بيمسح حركات الخزنة بتاعته، والخزنة مش بتتقري غير بعد فتح قفلها.
-- =========================================================================

-- ===== Treasury balance guard =====
create or replace function public.treasury_balance() returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when transaction_type = 'in' then amount else -amount end), 0)
  from public.treasury_transactions
$$;

create or replace function public.trg_treasury_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('mrc_treasury'));
  if new.amount is null or new.amount <= 0 then
    raise exception 'المبلغ لازم يكون أكبر من صفر';
  end if;
  if new.transaction_type = 'out' and public.treasury_balance() < new.amount then
    raise exception 'رصيد الخزنة غير كافي لإتمام العملية';
  end if;
  return new;
end $$;

drop trigger if exists treasury_guard on public.treasury_transactions;
create trigger treasury_guard before insert on public.treasury_transactions
  for each row execute function public.trg_treasury_guard();

-- ===== Deals: paid amount changes move money (out on increase, refund on decrease/cancel) =====
create or replace function public.trg_deal_treasury() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_paid numeric := case when tg_op = 'UPDATE' then coalesce(old.amount_paid, 0) else 0 end;
  diff numeric := coalesce(new.amount_paid, 0) - old_paid;
  who text := coalesce((select full_name from public.app_users where id = public.current_app_user_id()), new.assigned_by_name, '');
begin
  if diff > 0 then
    insert into public.treasury_transactions(transaction_type, amount, description, related_deal_id)
    values ('out', diff, format('شراء وتخليص ديل (%s - العميل: %s) - بواسطة: %s', coalesce(new.watch_brand, 'ساعة'), new.client_name, who), new.id);
  elsif diff < 0 then
    insert into public.treasury_transactions(transaction_type, amount, description, related_deal_id)
    values ('in', -diff, format('استرجاع مبلغ ديل (%s - العميل: %s) - بواسطة: %s', coalesce(new.watch_brand, 'ساعة'), new.client_name, who), new.id);
  end if;
  return new;
end $$;

drop trigger if exists deal_treasury on public.deals;
create trigger deal_treasury after insert or update of amount_paid on public.deals
  for each row execute function public.trg_deal_treasury();

-- ===== Loans / bonuses: paid out of the treasury on insert =====
create or replace function public.trg_emp_financial_treasury() returns trigger
language plpgsql security definer set search_path = '' as $$
declare emp_name text := (select full_name from public.employees where id = new.employee_id);
begin
  insert into public.treasury_transactions(transaction_type, amount, description, related_emp_financial_id)
  values ('out', new.amount,
          case when new.transaction_type = 'loan' then 'سحب سلفة: ' else 'صرف بونص (مكافأة): ' end
            || coalesce(emp_name, '') || case when coalesce(new.notes, '') <> '' then ' - البيان: ' || new.notes else '' end,
          new.id);
  return new;
end $$;

drop trigger if exists emp_financial_treasury on public.employee_financials;
create trigger emp_financial_treasury after insert on public.employee_financials
  for each row execute function public.trg_emp_financial_treasury();

-- ===== Deleting a deal / loan removes its treasury movements =====
alter table public.treasury_transactions drop constraint treasury_transactions_related_deal_id_fkey,
  add constraint treasury_transactions_related_deal_id_fkey foreign key (related_deal_id) references public.deals(id) on delete cascade;
alter table public.treasury_transactions drop constraint treasury_transactions_related_emp_financial_id_fkey,
  add constraint treasury_transactions_related_emp_financial_id_fkey foreign key (related_emp_financial_id) references public.employee_financials(id) on delete cascade;

-- ===== Treasury lock enforced on the server (per session) =====
alter table public.app_sessions add column if not exists treasury_unlocked boolean not null default false;

create or replace function public.is_treasury_unlocked() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.app_sessions s
    where s.token = nullif(current_setting('request.headers', true), '')::json->>'x-mrc-session'
      and s.expires_at > now() and s.treasury_unlocked)
$$;

create or replace function public.app_verify_lock(p_kind text, p_password text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.current_app_user_id(); ok boolean;
begin
  if uid is null then return false; end if;
  select exists(select 1 from public.app_locks where kind = p_kind and password_hash = extensions.crypt(p_password, password_hash))
      or exists(select 1 from public.app_users where role = 'owner' and password_hash = extensions.crypt(p_password, password_hash))
    into ok;
  if not ok then
    perform pg_sleep(0.5);
  elsif p_kind = 'treasury' then
    update public.app_sessions set treasury_unlocked = true
    where token = nullif(current_setting('request.headers', true), '')::json->>'x-mrc-session';
  end if;
  return ok;
end $$;

create or replace function public.app_lock_treasury() returns void
language sql security definer set search_path = '' as $$
  update public.app_sessions set treasury_unlocked = false
  where token = nullif(current_setting('request.headers', true), '')::json->>'x-mrc-session'
$$;

revoke execute on function public.treasury_balance(), public.trg_treasury_guard(), public.trg_deal_treasury(),
  public.trg_emp_financial_treasury(), public.is_treasury_unlocked(), public.app_lock_treasury() from public, anon, authenticated;
grant execute on function public.is_treasury_unlocked(), public.app_lock_treasury() to anon, authenticated;

drop policy if exists "logged in read" on public.treasury_transactions;
drop policy if exists "logged in insert" on public.treasury_transactions;
create policy "unlocked read" on public.treasury_transactions for select to anon, authenticated
  using ((select public.is_treasury_unlocked()));
create policy "unlocked insert" on public.treasury_transactions for insert to anon, authenticated
  with check ((select public.is_treasury_unlocked()));

-- ===== Employees: only the owner edits cards (self-service goes through app_update_profile) =====
drop policy if exists "owner or self update" on public.employees;
create policy "owner update" on public.employees for update to anon, authenticated
  using ((select public.is_app_owner())) with check ((select public.is_app_owner()));

-- ===== Deals: only the owner can delete a deal that has money paid on it =====
drop policy if exists "logged in all" on public.deals;
create policy "logged in read" on public.deals for select to anon, authenticated
  using ((select public.current_app_user_id()) is not null);
create policy "logged in insert" on public.deals for insert to anon, authenticated
  with check ((select public.current_app_user_id()) is not null);
create policy "logged in update" on public.deals for update to anon, authenticated
  using ((select public.current_app_user_id()) is not null)
  with check ((select public.current_app_user_id()) is not null);
create policy "owner or unpaid delete" on public.deals for delete to anon, authenticated
  using ((select public.is_app_owner()) or coalesce(amount_paid, 0) = 0);

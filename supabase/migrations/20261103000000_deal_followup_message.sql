-- =========================================================================
-- رسالة المتابعة: بتتبعت للعميل كل (followup_interval_days) يوم طول ما الديل
-- لسه قيد التواصل. last_followup_at هيستخدمه سيرفر الإرسال لما يشتغل.
-- =========================================================================

alter table public.deals
  add column if not exists followup_message text,
  add column if not exists followup_interval_days integer not null default 15,
  add column if not exists last_followup_at timestamptz;

alter table public.deals drop constraint if exists deals_followup_interval_days_check;
alter table public.deals add constraint deals_followup_interval_days_check
  check (followup_interval_days between 1 and 365);

notify pgrst, 'reload schema';

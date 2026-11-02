-- =========================================================================
-- الديل يقدر يبقى عليه أكتر من صورة. item_image_url بيفضل = أول صورة
-- (للكارت الصغير وللنسخ القديمة)، و item_images فيها كل الصور.
-- =========================================================================

alter table public.deals add column if not exists item_images jsonb not null default '[]'::jsonb;

update public.deals set item_images = jsonb_build_array(item_image_url)
 where item_image_url is not null and item_image_url <> '' and item_images = '[]'::jsonb;

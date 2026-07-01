-- Cảnh báo SAI BRAND ở Module Thanh toán KOC: brand điền tay ≠ gian mà LINK thực sự bán.
-- LINK là chuẩn (cast tính đúng theo gian của link); chỉ cần sửa lại ô brand cho khớp.
-- So tsv.shop_id (gian video bán) vs cast_brand_shop[brand điền] → trả các lệnh lệch.
-- SECURITY DEFINER: chạy bằng quyền owner để bỏ qua RLS (anon đọc tiktok_shop_videos bị chặn).
create or replace function public.koc_payment_brand_audit()
returns table(pay_id uuid, staff text, full_name text, pay_date date, brand_typed text, video_id text, link_shop text, typed_shop text, status text)
language sql
stable
security definer
set search_path = public, pg_temp
set statement_timeout to '20s'
as $function$
  with rows as (
    select kp.id as pay_id, kp.staff, kp.full_name, kp.pay_date, upper(coalesce(kp.brand,'')) as brand_typed,
      m[1] as video_id
    from koc_payments kp, lateral regexp_matches(kp.air_link, '/video/(\d{6,})', 'g') as m
    where coalesce(kp.air_link,'') <> '' and coalesce(kp.cast_net,0) > 0
  ),
  enr as (
    select distinct on (r.pay_id, r.video_id) r.*, tv.shop_id as link_shop_id, bs.shop_id as typed_shop_id
    from rows r
    left join tiktok_shop_videos tv on tv.id = r.video_id
    left join cast_brand_shop bs on bs.brand = r.brand_typed
  )
  select pay_id, staff, full_name, pay_date, brand_typed, video_id,
    (select seller_name from tiktok_shop_connections where shop_id = link_shop_id) as link_shop,
    (select seller_name from tiktok_shop_connections where shop_id = typed_shop_id) as typed_shop,
    'SAI_BRAND'::text as status
  from enr
  where link_shop_id is not null and typed_shop_id is not null and link_shop_id <> typed_shop_id;
$function$;

grant execute on function public.koc_payment_brand_audit() to anon, authenticated;

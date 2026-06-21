-- Bóc tách GMV theo loại nội dung KOC cho dashboard Hiệu suất KOC:
--   Video · Live · LinkShare (creator dán link SP) · Shop (showcase/gian hàng liên kết của creator) · Khác.
-- Cùng filter với koc_order_totals (shop + order_date + creator_username không rỗng). Tổng 4-5 loại = TỔNG GMV.
-- Đã apply lên DB 2026-06-20.
create or replace function public.koc_gmv_by_content(p_shop_id text, p_start date, p_end date)
returns table(gmv_video numeric, gmv_live numeric, gmv_linkshare numeric, gmv_shop numeric, gmv_other numeric)
language sql stable set statement_timeout to '20s'
as $function$
  select
    coalesce(sum(price_amount*quantity) filter (where content_type='VIDEO'),0)::numeric,
    coalesce(sum(price_amount*quantity) filter (where content_type='LIVE'),0)::numeric,
    coalesce(sum(price_amount*quantity) filter (where content_type='LINKSHARE'),0)::numeric,
    coalesce(sum(price_amount*quantity) filter (where content_type='SHOP'),0)::numeric,
    coalesce(sum(price_amount*quantity) filter (where content_type is null or content_type not in ('VIDEO','LIVE','LINKSHARE','SHOP')),0)::numeric
  from tiktok_affiliate_orders
  where (p_shop_id is null or shop_id = p_shop_id)
    and (p_start is null or order_date >= p_start)
    and (p_end   is null or order_date <= p_end)
    and creator_username is not null and creator_username <> '';
$function$;
grant execute on function public.koc_gmv_by_content(text,date,date) to anon, authenticated;

-- Sửa lỗi "KOC có video nhưng cột Video tổng/kỳ hiện 0" (tab Hiệu suất KOC).
-- Nguyên nhân: vtotal/vperiod đếm từ tiktok_shop_videos theo username; bảng này đôi khi
--   THIẾU video của KOC (chưa sync) -> ra 0 dù KOC thực sự có video (thấy trong drill-down).
-- Sửa: lấy GREATEST giữa (đếm bảng video) và (o.videos = đếm video content_id từ ĐƠN affiliate,
--   đáng tin & khớp drill-down). KOC có sẵn dữ liệu bảng video không đổi; KOC thiếu thì hiện đúng số.
-- Đã apply lên DB + DELETE koc_orders_cache (xoá cache cũ) 2026-06-16.
CREATE OR REPLACE FUNCTION public.koc_order_stats(p_shop_id text, p_start date, p_end date)
 RETURNS TABLE(creator_username text, orders bigint, gmv numeric, qty bigint, commission numeric, videos bigint, lives bigint, products bigint, last_order bigint, vtotal bigint, vperiod bigint)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '20s'
AS $function$
  with o as (
    select creator_username,
      count(distinct order_id) as orders,
      coalesce(sum(price_amount * quantity), 0) as gmv,
      coalesce(sum(quantity), 0) as qty,
      coalesce(sum(est_commission), 0) as commission,
      count(distinct content_id) filter (where content_type = 'VIDEO' and content_id <> '') as videos,
      count(distinct content_id) filter (where content_type = 'LIVE'  and content_id <> '') as lives,
      count(distinct product_id) filter (where product_id <> '') as products,
      max(create_time) as last_order
    from tiktok_affiliate_orders
    where (p_shop_id is null or shop_id = p_shop_id)
      and (p_start is null or order_date >= p_start)
      and (p_end   is null or order_date <= p_end)
      and creator_username is not null and creator_username <> ''
    group by creator_username
  ),
  v as (
    select lower(username) as uname,
      count(distinct id) as vtotal,
      count(distinct id) filter (where post_date is not null
        and (p_start is null or post_date >= p_start)
        and (p_end   is null or post_date <= p_end)) as vperiod
    from tiktok_shop_videos
    where (p_shop_id is null or shop_id = p_shop_id) and coalesce(username,'') <> ''
    group by lower(username)
  )
  select o.creator_username, o.orders, o.gmv, o.qty, o.commission, o.videos, o.lives, o.products, o.last_order,
    greatest(coalesce(v.vtotal, 0), o.videos)  as vtotal,
    greatest(coalesce(v.vperiod, 0), o.videos) as vperiod
  from o left join v on v.uname = lower(o.creator_username)
  order by o.gmv desc;
$function$;

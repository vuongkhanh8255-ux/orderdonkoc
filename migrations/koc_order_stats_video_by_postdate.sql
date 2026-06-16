-- "Video kỳ" phải đếm video ĐĂNG trong khoảng ngày đã chọn (KHÔNG phải video có đơn trong kỳ).
-- (Bản này thay cho koc_order_stats_video_fallback.sql: bản trước floor theo o.videos = video có ĐƠN
--  trong kỳ -> video air tháng 4 mà bán đơn tháng 5 bị tính nhầm vào tháng 5.)
-- Cách đúng: ngày đăng mỗi video = post_date (bảng tiktok_shop_videos) HOẶC ngày đơn đầu tiên (cho
--   video thiếu trong bảng video). vtotal = tổng video toàn TG; vperiod = video có ngày đăng trong kỳ.
-- Đã apply lên DB + DELETE koc_orders_cache 2026-06-16. (eHerb VN ~8.1s, dưới statement_timeout 20s.)
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
  vid_ord as (  -- video từ ĐƠN (toàn TG), ngày đăng ước lượng = ngày đơn đầu tiên
    select lower(regexp_replace(creator_username, '^@', '')) as uname, content_id, min(order_date) as post_eff
    from tiktok_affiliate_orders
    where (p_shop_id is null or shop_id = p_shop_id)
      and content_type = 'VIDEO' and coalesce(content_id,'') <> ''
      and creator_username is not null and creator_username <> ''
    group by 1, 2
  ),
  vid_tab as (  -- video từ BẢNG video, ngày đăng thật
    select lower(regexp_replace(username, '^@', '')) as uname, id as content_id, post_date as post_eff
    from tiktok_shop_videos
    where (p_shop_id is null or shop_id = p_shop_id) and coalesce(username,'') <> ''
  ),
  vid as (  -- gộp 2 nguồn theo (KOC, video), lấy ngày đăng sớm nhất
    select uname, content_id, min(post_eff) as post_eff
    from (select * from vid_ord union all select * from vid_tab) z
    group by uname, content_id
  ),
  v as (
    select uname,
      count(*) as vtotal,
      count(*) filter (where post_eff is not null
        and (p_start is null or post_eff >= p_start)
        and (p_end   is null or post_eff <= p_end)) as vperiod
    from vid
    group by uname
  )
  select o.creator_username, o.orders, o.gmv, o.qty, o.commission, o.videos, o.lives, o.products, o.last_order,
    coalesce(v.vtotal, 0)  as vtotal,
    coalesce(v.vperiod, 0) as vperiod
  from o left join v on v.uname = lower(regexp_replace(o.creator_username, '^@', ''))
  order by o.gmv desc;
$function$;

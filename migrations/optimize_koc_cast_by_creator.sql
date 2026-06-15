-- Tối ưu koc_cast_by_creator (sửa lỗi "statement timeout" ở tab Hiệu suất KOC)
-- Nguyên nhân: sau khi backfill kéo về ~94k+ đơn/shop, hàm quét TOÀN BỘ đơn của shop
--   (không lọc ngày) chỉ để lấy danh sách video -> 21s -> vượt statement_timeout 8s.
-- Cách sửa: đảo logic — lấy video ĐĂNG TRONG KỲ trước (ít, ~245), rồi mới tra đơn
--   cho đúng mấy video đó (dùng index shop_id+content_id). Kết quả giữ nguyên 100%.
-- Kết quả: 30 ngày 21000ms -> 153ms; "Tất cả" -> ~2900ms. Đã apply trực tiếp lên DB 2026-06-15.

CREATE INDEX IF NOT EXISTS idx_aff_orders_shop_content ON tiktok_affiliate_orders (shop_id, content_id);

CREATE OR REPLACE FUNCTION public.koc_cast_by_creator(p_shop_id text, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS TABLE(creator_username text, cast_total numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with vids as (
    select tv.id as content_id
    from tiktok_shop_videos tv
    where tv.shop_id = p_shop_id
      and (p_start is null or tv.post_date >= p_start)
      and (p_end   is null or tv.post_date <= p_end)
  ),
  creator_of as (
    select distinct o.creator_username, o.content_id
    from tiktok_affiliate_orders o
    join vids on vids.content_id = o.content_id
    where o.shop_id = p_shop_id and coalesce(o.content_id,'') <> ''
  )
  select co.creator_username, sum(vc.cast_amount)::numeric as cast_total
  from creator_of co
  join v_video_cast vc on vc.content_id = co.content_id
  where vc.cast_amount is not null
  group by co.creator_username;
$function$;

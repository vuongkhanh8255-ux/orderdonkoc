-- Cột "View tổng" ở Hiệu suất KOC = view PHÁT SINH trong kỳ (scale theo khung thời gian).
-- = tổng view-THÁNG (tiktok_video_monthly_views) của các video KÉO ĐƠN trong kỳ,
--   chỉ cộng các THÁNG nằm trong [p_start, p_end]. Cùng tập video với cột "Video".
-- Vì sao theo tháng: TikTok chỉ trả view theo kỳ/tháng, không có view-theo-ngày. Dùng
-- total view (tiktok_shop_videos.views) thì 1 video to kéo đơn nhiều kỳ → cộng nguyên →
-- 7 ngày và 30 ngày ra giống nhau. View-tháng giúp số tăng dần theo độ dài khung.
-- LƯU Ý: bỏ bản overload cũ (text,text,text) nếu còn (Supabase gọi string sẽ chọn nhầm).
drop function if exists koc_video_views(text, text, text);
create or replace function koc_video_views(p_shop_id text, p_start date, p_end date)
returns table(uname text, total_views bigint)
language sql stable as $$
  with vids as (
    select distinct o.creator_username, o.content_id
    from tiktok_affiliate_orders o
    where o.content_type = 'VIDEO' and coalesce(o.content_id, '') <> ''
      and o.creator_username is not null and o.creator_username <> ''
      and (p_shop_id is null or o.shop_id = p_shop_id)
      and (p_start is null or o.order_date >= p_start)
      and (p_end   is null or o.order_date <= p_end)
  ),
  months as (
    select to_char(gs, 'YYYY-MM') ym
    from generate_series(
      date_trunc('month', coalesce(p_start, date '2026-01-01')),
      date_trunc('month', coalesce(p_end, current_date)),
      interval '1 month') gs
  )
  select lower(regexp_replace(v.creator_username, '^@', '')) as uname,
         coalesce(sum(mv.views), 0)::bigint as total_views
  from vids v
  join tiktok_video_monthly_views mv
    on mv.id = v.content_id and mv.ym in (select ym from months)
  group by 1;
$$;

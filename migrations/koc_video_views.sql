-- Cột "View tổng" ở Hiệu suất KOC.
-- View mỗi KOC = tổng view của các VIDEO đã KÉO ĐƠN trong kỳ [p_start, p_end]
-- (khớp đúng tập content_id với cột "Video" = count distinct content_id VIDEO trong đơn).
-- Lấy distinct content_id từ tiktok_affiliate_orders rồi join tiktok_shop_videos.views.
-- Match KOC bằng username đã bỏ '@' + lowercase (merge ở backend handleKocOrders).
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
  )
  select lower(regexp_replace(v.creator_username, '^@', '')) as uname,
         coalesce(sum(sv.views), 0)::bigint as total_views
  from vids v
  join tiktok_shop_videos sv on sv.id = v.content_id
  group by 1;
$$;

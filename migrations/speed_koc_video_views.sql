-- Tăng tốc cột View ở Hiệu suất KOC (koc_video_views): ~2150ms → ~780ms.
-- Covering index để join sv.id = content_id lấy luôn views từ index (khỏi heap fetch).
create index if not exists idx_shop_videos_id_views
  on public.tiktok_shop_videos (id) include (views);
-- Index nhắm đúng đơn VIDEO theo shop + ngày (thay vì quét theo creator rồi lọc content_type).
create index if not exists idx_aff_orders_shop_ctype_date
  on public.tiktok_affiliate_orders (shop_id, content_type, order_date) include (creator_username, content_id);
analyze public.tiktok_shop_videos;
analyze public.tiktok_affiliate_orders;

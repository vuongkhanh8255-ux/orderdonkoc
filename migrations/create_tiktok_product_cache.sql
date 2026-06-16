-- Cache tên + ảnh sản phẩm TikTok (cho drill-down sản phẩm/video của KOC).
-- Trước đây mỗi lần xem gọi TikTok ~30 lần (1 lần/sản phẩm) -> chậm + dễ dính rate-limit (36009002).
-- Giờ: đọc cache trước, chỉ gọi TikTok cho sản phẩm CHƯA cache rồi lưu lại -> lần sau ~0 lần gọi.
-- Tên còn lấy thêm từ tiktok_shop_videos.product_name (đã sync). Đã apply lên DB 2026-06-16.
create table if not exists tiktok_product_cache (
  product_id text primary key,
  shop_id    text,
  name       text,
  image      text,
  updated_at timestamptz default now()
);
alter table tiktok_product_cache enable row level security;
drop policy if exists "read all tiktok_product_cache" on tiktok_product_cache;
create policy "read all tiktok_product_cache" on tiktok_product_cache for select using (true);

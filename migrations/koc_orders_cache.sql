-- Cache CHUNG kết quả action=koc_orders (Hiệu suất KOC) — mọi máy dùng chung.
-- Backend (handleKocOrders): trước khi tính, đọc cache theo cache_key; nếu sync_token khớp
-- (data chưa đổi) → trả luôn. Tính xong thì upsert lại. "Tải lại" gửi ?force=1 để bỏ qua.
-- sync_token = total_synced|high_water_create_time|backfill_done của shop → đổi khi có đơn mới.
create table if not exists public.koc_orders_cache (
  cache_key text primary key,   -- shopId|start|end
  payload   jsonb not null,     -- nguyên response koc_orders
  sync_token text,              -- vân tay data lúc build; khác hiện tại = stale → tính lại
  built_at  timestamptz default now()
);

-- Popup "phóng to" xem kênh KOC: edge function koc-channel-views trả thêm videos_all (~10 clip gần nhất
-- để XEM), giữ videos (7 clip) để tính ngưỡng. Cần cột videos_all để cache (upsert row) không lỗi.
alter table public.koc_channel_views add column if not exists videos_all jsonb;

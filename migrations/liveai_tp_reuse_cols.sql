-- 3/7/2026 — Tối ưu từ vòng thẩm định QUY-TRINH (mục 11.6): TÁI DÙNG talking_photo_id.
-- Mỗi lần 🎬 trước đây upload ảnh thành talking-photo MỚI bên HeyGen (rác + dính trần group).
-- Nay lưu lại id + ảnh nguồn: nếu ảnh không đổi thì dùng lại id cũ, khỏi upload.
alter table public.livestream_clip_prod add column if not exists talking_photo_id text default '';
alter table public.livestream_clip_prod add column if not exists tp_image_url text default '';

-- 3/7/2026 — Xưởng Clip Phase 2 (tự động OpenAI + HeyGen).
-- Thêm cột theo dõi job HeyGen + Storage bucket chứa ảnh nhân vật gen từ OpenAI.
alter table public.livestream_clip_prod add column if not exists video_id text default '';  -- HeyGen video_id (poll)
alter table public.livestream_clip_prod add column if not exists voice_id text default '';  -- giọng Việt đã dùng

-- Bucket công khai chứa ảnh gen (server dùng service role upload; frontend đọc qua public URL).
insert into storage.buckets (id, name, public) values ('live-assets', 'live-assets', true)
on conflict (id) do update set public = true;

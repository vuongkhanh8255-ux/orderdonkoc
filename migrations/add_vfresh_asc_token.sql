-- Cursor cho luồng "Cào video mới" (sync_videos_fresh, ASC sweep) — gian thuộc VIDEO_FULL_SHOPS
-- quét SÂU DẦN qua nhiều nhịp (nhớ cào tới đâu) để bắt cả video GIỮA (view trung bình) của kênh đã gửi đơn.
-- Trước đây ASC luôn cào lại 150 video ít-view nhất mỗi lần → giậm chân, không tới video giữa → warning oan.
alter table public.tiktok_affiliate_sync_meta add column if not exists vfresh_asc_token text;

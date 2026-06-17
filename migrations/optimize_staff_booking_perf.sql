-- Tối ưu hiệu năng báo cáo nhân sự (staff_booking_report) — 23.9s → ~5s.
-- Nguyên nhân chậm: (1) tiktok_shop_videos SEQ SCAN 90k dòng rồi lọc post_date trong join,
--                   (2) sort/merge ~100k đơn tiktok_affiliate_orders SPILL ra disk.
-- Fix: index (shop_id, post_date) cho video + tăng work_mem để sort nằm trong RAM (hết spill).
-- Đã apply lên DB 2026-06-17. (work_mem/timeout cũng đã set sẵn trong định nghĩa 2 hàm.)
create index if not exists idx_shop_videos_shop_postdate on public.tiktok_shop_videos (shop_id, post_date);

alter function public.staff_booking_report(date, date) set work_mem = '256MB';
alter function public.staff_booking_report(date, date) set statement_timeout = '40s';
alter function public.staff_booking_detail(uuid, date, date) set work_mem = '256MB';
alter function public.staff_booking_detail(uuid, date, date) set statement_timeout = '30s';

analyze public.tiktok_shop_videos;

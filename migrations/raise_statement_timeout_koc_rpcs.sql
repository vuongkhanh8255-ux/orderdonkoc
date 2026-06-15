-- Lưới an toàn cho tab Hiệu suất KOC: nâng statement_timeout 5 RPC analytics lên 20s.
-- Lý do: phạm vi "Tất cả" + shop lớn (eHerb VN ~184k đơn) -> 1 query đơn lẻ có thể ~6-8s,
--   chạm ngưỡng mặc định (~8s). Nâng 20s để không lỗi; kết quả vẫn được cache lại.
-- Đi kèm: api/tiktok-shop/analytics.js đổi 5 RPC từ Promise.all (cùng lúc) sang chạy
--   TUẦN TỰ để mỗi query đứng 1 mình (không tranh tài nguyên) -> nhanh & không timeout.
-- Đã apply trực tiếp lên DB 2026-06-15.

ALTER FUNCTION public.koc_order_stats(text, date, date)     SET statement_timeout = '20s';
ALTER FUNCTION public.koc_order_totals(text, date, date)    SET statement_timeout = '20s';
ALTER FUNCTION public.koc_video_views(text, date, date)     SET statement_timeout = '20s';
ALTER FUNCTION public.koc_cast_by_creator(text, date, date) SET statement_timeout = '20s';
ALTER FUNCTION public.koc_sample_cost(date, date)           SET statement_timeout = '20s';

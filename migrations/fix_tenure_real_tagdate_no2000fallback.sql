-- 21/7/2026 — FIX BUG "2000-fallback" trong tính GMV/video theo tenure (Báo cáo nhân sự)
-- Triệu chứng: gỡ tag làm số nhảy 2 chiều. Hoàng Vũ DƯ ẢO +75M (133.6M vs 58.6M thật),
--   Ngọc Mai THIẾU -71M (393.8M vs 465.2M thật). Video tăng mà GMV giảm/gấp đôi vô lý.
-- Gốc: khi gỡ tag, KOC chuyển sang sa_past với tag_date = coalesce(lịch-sử-assign, '2000-01-01').
--   KOC bị gỡ mà KHÔNG có bản ghi 'assign'/'approve' trong lịch sử (VD embehellokittyyy chỉ có
--   mỗi 'remove') -> tag_date = 2000 -> khoảng giữ tag [2000 -> ngày gỡ] quá rộng:
--     • VƠ video KOC air trước khi thật sự giữ tag (over-count: Hoàng Vũ +71M từ embehellokittyyy)
--     • Kéo tag_date về 2000 -> thua tiebreak "ai gắn gần nhất" -> video rớt sang người khác (Ngọc Mai thiếu)
-- Fix: LƯU ngày gắn thật khi gỡ (không đoán 2000 nữa) + bỏ hẳn fallback 2000 trong 3 hàm tính.

-- 1) Cột lưu ngày gắn thật của tag lúc bị gỡ
alter table koc_assignment_history add column if not exists tag_since date;

-- 2) Backfill các lần gỡ cũ từ lịch sử assign/approve (nếu có). 203/1388 không có -> để null -> bị loại (đúng luật).
with hist_as as (
  select lower(trim(staff_name)) staff, lower(regexp_replace(koc_id,'^@','')) uname, upper(trim(brand_name)) brand_u, min(created_at::date) s
  from koc_assignment_history where action in ('assign','approve') group by 1,2,3)
update koc_assignment_history h set tag_since = a.s
from hist_as a
where h.action='remove' and h.tag_since is null
  and a.staff=lower(trim(h.staff_name)) and a.uname=lower(regexp_replace(h.koc_id,'^@','')) and a.brand_u=upper(trim(h.brand_name));

-- 3) koc_remove_assignment: CHỤP coalesce(approved_at,assigned_at) vào tag_since trước khi xóa (xem migration Supabase
--    'koc_history_tag_since_and_remove_capture'). Going-forward không bao giờ mất ngày gắn nữa.

-- 4) 3 hàm tính đổi sa_past/past: tag_date = coalesce(remove.tag_since, hist_as.s); BỎ fallback 2000;
--    loại dòng không có ngày gắn (require non-null). Áp qua migration Supabase:
--    - staff_booking_report_real_tagdate  (bảng tổng: hist_rm thêm min(tag_since); sa_past dùng coalesce(tag_since_rm,h.s), where ... is not null)
--    - staff_booking_detail_real_tagdate  (chi tiết: past_raw thêm min(tag_since); past bỏ lag()+2000)
--    - staff_tenure_videos_real_tagdate   (bảng "Video tự động ghi nhận theo tag")
-- Verify: Hoàng Vũ 133.6M->58.6M (khớp ảnh trước 62.8M), Ngọc Mai 393.8M->465.2M, 14 NS đều ổn.

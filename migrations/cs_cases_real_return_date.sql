-- 30/7/2026 — Module 2: cột "Ngày" phải là NGÀY KHÁCH TRẢ, không phải ngày máy kéo về.
--
-- LỖI: cs_seed_return_cases không set created_at → mặc định now() ⇒ cả 2.949 hồ sơ đóng dấu
-- 21–30/7 dù đơn trả thật rải từ tháng 3 → tháng 7. Hậu quả: bảng "Tỷ lệ THHT theo nguyên nhân
-- · chọn nhiều tháng" cho số vô nghĩa (bấm tháng 6 ra 0 đơn), lọc khoảng ngày cũng sai,
-- gian nào có đơn trả cũ (Real Steel — toàn tháng 3) thì CS nhìn thấy 0 đơn.
--
-- NGUỒN NGÀY (đo thật trước khi dùng, không đoán):
--   • TikTok = tiktok_returns.create_time — ngày khách MỞ yêu cầu trả (chính xác).
--   • Shopee = shopee_orders.update_time  — lần đổi trạng thái cuối ≈ lúc vào TO_RETURN.
--     Verify 307 đơn: 0 đơn có update_time sớm hơn ngày đặt, trung bình +6,2 ngày. Hợp lý.
--   • Nhánh dự phòng affiliate = tiktok_affiliate_orders.order_date.
--
-- 1 ĐƠN NHIỀU LẦN YÊU CẦU TRẢ (694 đơn, 260 đơn lệch ngày, xa nhất 20 ngày) → lấy MIN (lần mở
-- ĐẦU TIÊN). Lý do chọn MIN chứ không phải MAX: MIN không bao giờ đổi. Nếu lấy lần cuối thì
-- khách mở lại yêu cầu là ngày của hồ sơ cũ nhảy tới → báo cáo tháng đã chốt bị đổi số về sau.
--
-- Bảng sao lưu để hoàn tác: _cs_cases_created_at_backup_3007 (id, created_at cũ).
-- Hoàn tác:  update cs_cases c set created_at = b.created_at
--            from _cs_cases_created_at_backup_3007 b where b.id = c.id;
--
-- KẾT QUẢ: ngày rải đúng — T3: 4 · T5: 169 · T6: 1.229 · T7: 1.551 hồ sơ.
-- Lưu ý side-effect đã cân nhắc: daily_report_kpi.cases_overdue (created_at <= today-3) sẽ tăng,
-- nhưng Module 8 Daily Report đã gỡ khỏi menu từ 27/7 nên không ai nhìn con số đó.

-- ── BƯỚC 1: sao lưu ──────────────────────────────────────────────────────────
create table if not exists _cs_cases_created_at_backup_3007 as
  select id, created_at from cs_cases where case_type = 'return';

-- ── BƯỚC 2: lấp ngược ────────────────────────────────────────────────────────
with src as (
  select 'tiktok|' || order_id as ok, min(to_timestamp(create_time)) as ngay
  from tiktok_returns group by order_id
)
update cs_cases c set created_at = src.ngay
from src where c.order_key = src.ok and c.case_type = 'return'
  and c.created_at::date is distinct from src.ngay::date;

with src2 as (
  select 'tiktok|' || order_id as ok, min(order_date)::timestamptz as ngay
  from tiktok_affiliate_orders where fully_return = 'Yes' group by order_id
)
update cs_cases c set created_at = src2.ngay
from src2 where c.order_key = src2.ok and c.case_type = 'return' and c.platform = 'tiktok'
  and not exists (select 1 from tiktok_returns t where 'tiktok|' || t.order_id = c.order_key)
  and c.created_at::date is distinct from src2.ngay::date;

update cs_cases c set created_at = to_timestamp(o.update_time)
from shopee_orders o
where o.order_sn = c.order_sn and c.case_type = 'return' and c.platform = 'shopee'
  and o.update_time is not null
  and c.created_at::date is distinct from to_timestamp(o.update_time)::date;

-- ── BƯỚC 3: hồ sơ MỚI cũng mang ngày thật ────────────────────────────────────
-- (bản đầy đủ của hàm nằm ở migration Supabase `cs_seed_return_cases_set_real_date`;
--  điểm khác so với bản cũ: mỗi nhánh INSERT thêm cột created_at, và nhánh TikTok dùng
--  DISTINCT ON (order_id) ORDER BY create_time để lấy lần yêu cầu ĐẦU — khớp với lấp ngược,
--  thay cho kiểu "đơn nào vào trước thì thắng" của on-conflict.)

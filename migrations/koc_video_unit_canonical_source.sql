-- ───────────────────────────────────────────────────────────────────────────
-- NGUỒN CHUẨN DUY NHẤT cho "KOC đã lên clip / có video chưa" toàn app (6/2026)
--
-- Vấn đề: mỗi tab đếm video một kiểu, nhiều chỗ chỉ đọc bảng `tiktok_shop_videos`
-- (video/đơn vào DB trễ 1-2 tuần) -> báo "0 video / chưa lên clip" oan dù KOC đã đăng.
--
-- Giải pháp: 1 định nghĩa duy nhất = GỘP (đơn affiliate content_type=VIDEO) + (bảng video),
-- khử trùng theo content_id (mã video TikTok). Đơn hàng tươi hơn nên bắt được clip sớm.
-- Tất cả hàm liên quan dùng chung định nghĩa này:
--   - koc_no_video_warnings   (Order: "KOC chưa lên clip")
--   - staff_booking_report    (Báo cáo nhân sự: thẻ Video / cột so_video)
--   - staff_booking_detail     (Báo cáo nhân sự: drill từng KOC — vốn đã gộp)
--   - koc_assignment_warnings  (Định danh KOC: "0 video -> đề xuất gỡ", lọc đúng 1 shop)
--
-- LƯU Ý nghiệp vụ: map brand->shop GIỮ RIÊNG theo từng tab (báo cáo NS gộp eHerb VN+HCM,
-- Định danh tính riêng từng gian) — chỉ thống nhất NGUỒN ĐẾM VIDEO, không thống nhất mapping.
-- ───────────────────────────────────────────────────────────────────────────

create or replace view koc_video_unit as
  select shop_id, uname, content_id, min(post_eff) as post_eff
  from (
    select o.shop_id,
           lower(regexp_replace(coalesce(o.creator_username,''),'^@','')) as uname,
           o.content_id,
           min(o.order_date)::date as post_eff
    from tiktok_affiliate_orders o
    where o.content_type = 'VIDEO' and coalesce(o.content_id,'') <> ''
    group by o.shop_id, lower(regexp_replace(coalesce(o.creator_username,''),'^@','')), o.content_id
    union all
    select v.shop_id,
           lower(regexp_replace(coalesce(v.username,''),'^@','')) as uname,
           v.id as content_id,
           v.post_date as post_eff
    from tiktok_shop_videos v
  ) z
  where coalesce(uname,'') <> '' and coalesce(content_id,'') <> ''
  group by shop_id, uname, content_id;

-- Các hàm consumer (koc_no_video_warnings, staff_booking_report, koc_assignment_warnings)
-- đã được cập nhật dùng nguồn này — xem các migration cùng đợt trong Supabase:
--   koc_no_video_warnings_fast_canonical
--   staff_booking_report_video_canonical_source
--   koc_assignment_warnings_use_canonical_view
-- (koc_no_video_warnings & staff_booking_report dùng union materialized inline cùng định nghĩa
--  để né timeout khi quét nhiều shop; koc_assignment_warnings lọc 1 shop nên gọi thẳng view.)

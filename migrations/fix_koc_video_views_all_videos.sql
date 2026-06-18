-- FIX BUG cột/KPI View ở Hiệu suất KOC (2 lỗi):
--  (1) RPC cũ chỉ tính view video CÓ ĐƠN (lấy content_id từ tiktok_affiliate_orders)
--      → bỏ hết view của video air nhưng 0 đơn → TỔNG VIEW thấp giả.
--  (2) RPC per-KOC trả >1000 dòng (mỗi KOC 1 dòng) → PostgREST CẮT BỚT dòng (~1000)
--      → backend cộng thiếu (vd Milaganics T6: 1.087.064 thật → 458.339 do bị cắt).
-- Sửa: KPI tổng lấy từ hàm scalar (1 dòng, không bị cắt); per-KOC dùng MỌI video của shop
-- (nguồn tiktok_video_monthly_views, view tăng-thêm/tháng, gom theo KOC qua username ở
-- tiktok_shop_videos), order by view desc để cắt thì giữ KOC view cao trước.
create index if not exists idx_vmv_shop_ym on tiktok_video_monthly_views (shop_id, ym);

-- KPI TỔNG VIEW (1 dòng)
create or replace function koc_video_views_total(p_shop_id text, p_start date, p_end date)
returns bigint
language sql stable
set statement_timeout to '20s'
as $$
  with months as (
    select to_char(gs,'YYYY-MM') ym
    from generate_series(date_trunc('month', coalesce(p_start, date '2026-01-01')),
                         date_trunc('month', coalesce(p_end, current_date)),
                         interval '1 month') gs
  )
  select coalesce(sum(views),0)::bigint
  from tiktok_video_monthly_views
  where (p_shop_id is null or shop_id = p_shop_id) and ym in (select ym from months);
$$;

-- per-KOC (điền cột View từng KOC)
create or replace function koc_video_views(p_shop_id text, p_start date, p_end date)
returns table(uname text, total_views bigint)
language sql stable
set statement_timeout to '20s'
as $$
  with months as (
    select to_char(gs,'YYYY-MM') ym
    from generate_series(date_trunc('month', coalesce(p_start, date '2026-01-01')),
                         date_trunc('month', coalesce(p_end, current_date)),
                         interval '1 month') gs
  ),
  mv as (
    select id, sum(views) as views from tiktok_video_monthly_views
    where (p_shop_id is null or shop_id = p_shop_id) and ym in (select ym from months)
    group by id
  )
  select lower(regexp_replace(sv.username, '^@', '')) as uname,
         coalesce(sum(mv.views), 0)::bigint as total_views
  from mv join tiktok_shop_videos sv on sv.id = mv.id
  where coalesce(sv.username, '') <> ''
  group by 1
  order by 2 desc;
$$;

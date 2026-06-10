-- PHASE 2 — Lịch sử định danh KOC (append-only log mỗi thao tác gán/đề xuất/duyệt/loại).
create table if not exists public.koc_assignment_history (
  id bigint generated always as identity primary key,
  koc_id text not null,
  brand_name text,
  staff_name text,
  action text,            -- 'assign' | 'propose' | 'approve' | 'remove'
  actor text,             -- username thực hiện
  created_at timestamptz default now()
);
create index if not exists koc_assign_hist_koc_idx on public.koc_assignment_history (koc_id, created_at desc);

-- PHASE 3 — Cảnh báo 45 ngày 0 video. Đếm video KOC ĐĂNG cho shop kể từ ngày được duyệt gán.
-- Chỉ xét assignment 'approved'. video_count = số clip có post_date >= ngày gán (cùng shop).
create or replace function koc_assignment_warnings(p_shop_id text, p_brand text)
returns table(koc_id text, staff_name text, since_date date, days_since int, video_count bigint)
language sql stable as $$
  select a.koc_id, a.staff_name,
    coalesce(a.approved_at, a.assigned_at)::date as since_date,
    (current_date - coalesce(a.approved_at, a.assigned_at)::date) as days_since,
    (select count(*) from tiktok_shop_videos v
       where lower(regexp_replace(coalesce(v.username, ''), '^@', '')) = a.koc_id
         and v.shop_id = p_shop_id
         and v.post_date >= coalesce(a.approved_at, a.assigned_at)::date) as video_count
  from koc_brand_assignments a
  where a.brand_name = p_brand and a.status = 'approved';
$$;

-- TỰ ĐỘNG GỠ TAG QUÁ HẠN (backend, thay cho danh sách "Đề xuất Gỡ chờ duyệt" ở web).
-- Quá hạn = koc_assignment_warnings: order chưa ra clip -> 30 ngày kể từ đơn; đã có clip -> 45 ngày kể từ air gần nhất.
-- Loại trừ: KOC đã book cast (koc_payments cast_net>0) + đang/đã ưu tiên (koc_tag_priority: approved <10 ngày HOẶC proposed đang chờ admin duyệt).
-- Gỡ + ghi koc_assignment_history (action='remove', actor='auto (quá hạn)'). Chạy pg_cron mỗi giờ phút 41.
-- CỜ TẮT NHANH: app_flags 'auto_remove_overdue'=false -> RPC return sớm (nút BẬT/TẮT cho admin ở trang Hiệu suất KOC).
-- Áp qua Supabase MCP apply_migration (2026-07-20; cập nhật 21/7: +chừa proposed, +cờ tắt). File này để lưu vết.

create or replace function public.auto_remove_overdue_assignments(p_dry boolean default false)
returns table(koc_id text, brand_name text, staff_name text, days_over integer, limit_days integer)
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '90s'
as $$
#variable_conflict use_column
begin
  -- CỜ TẮT: app_flags 'auto_remove_overdue' = false -> không gỡ gì
  if not coalesce((select enabled from app_flags where flag = 'auto_remove_overdue'), true) then
    return;
  end if;

  create temp table _rm on commit drop as
  with a as (
    select a.koc_id, a.brand_name, a.staff_name,
           coalesce(a.approved_at, a.assigned_at)::date as since_date,
           a.last_order_at, cbs.shop_id
    from koc_brand_assignments a
    join cast_brand_shop cbs on upper(trim(cbs.brand)) = upper(trim(a.brand_name))
    where a.status = 'approved'
  ),
  agg as (
    select a.koc_id, a.brand_name, a.staff_name, a.since_date, a.last_order_at, a.shop_id,
           max(u.post_eff::date) as last_air
    from a
    left join koc_video_unit u on u.shop_id = a.shop_id and u.uname = a.koc_id
    group by a.koc_id, a.brand_name, a.staff_name, a.since_date, a.last_order_at, a.shop_id
  ),
  f as (
    select *, (last_order_at is not null and (last_air is null or last_air < last_order_at)) as owes
    from agg
  ),
  g as (
    select koc_id, brand_name, staff_name,
      case when owes then (current_date - last_order_at) else (current_date - coalesce(last_air, since_date)) end as days_over,
      case when owes then 30 else 45 end as limit_days
    from f
  ),
  cast_kocs as (
    select distinct lower((regexp_match(channel_link, '@([^/?#]+)'))[1]) as uname
    from koc_payments where channel_link ~ '@' and cast_net is not null and cast_net > 0
  ),
  prio as (
    select lower(regexp_replace(ktp.koc_id,'^@','')) as uname, upper(trim(ktp.brand_name)) as brand_u
    from koc_tag_priority ktp
    where (ktp.status='approved' and ktp.prioritized_at is not null and ktp.prioritized_at >= now() - interval '10 days')
       or ktp.status='proposed'   -- chừa cả KOC đang XIN ưu tiên (chờ admin duyệt)
  )
  select g.koc_id, g.brand_name, g.staff_name, g.days_over::int as days_over, g.limit_days::int as limit_days
  from g
  where g.days_over >= g.limit_days
    and lower(regexp_replace(g.koc_id,'^@','')) not in (select uname from cast_kocs where uname is not null)
    and not exists (select 1 from prio p where p.uname = lower(regexp_replace(g.koc_id,'^@','')) and p.brand_u = upper(trim(g.brand_name)));

  if not p_dry then
    insert into koc_assignment_history(koc_id, brand_name, staff_name, action, actor)
    select r.koc_id, r.brand_name, r.staff_name, 'remove', 'auto (quá hạn)' from _rm r;

    delete from koc_brand_assignments a using _rm r
    where lower(regexp_replace(coalesce(a.koc_id,''),'^@','')) = lower(regexp_replace(coalesce(r.koc_id,''),'^@',''))
      and a.brand_name = r.brand_name and a.status = 'approved';
  end if;

  return query select r.koc_id, r.brand_name, r.staff_name, r.days_over, r.limit_days from _rm r order by r.days_over desc;
end $$;

-- Lịch chạy (đã áp qua MCP):
-- select cron.schedule('auto-remove-overdue-hourly', '41 * * * *', 'select public.auto_remove_overdue_assignments(false)');

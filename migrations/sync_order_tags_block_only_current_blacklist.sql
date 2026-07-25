-- 24/7/2026 (Khánh chốt) — LUẬT GẮN LẠI TAG:
--   • Blacklist  → KHÔNG cho gắn. Chỉ chặn khi kênh ĐANG nằm trong bảng koc_blacklist
--                  (gỡ khỏi blacklist rồi thì thành KOC thường, order lại được tag lại).
--   • Admin / nhân sự gỡ tay / từ chối / quá hạn nợ clip → order LẠI là gắn lại BÌNH THƯỜNG.
--     (BỎ HẲN cooldown 30 ngày cũ.)
--
-- LƯU Ý interplay với trigger `trg_block_zombie_assignment` trên koc_brand_assignments:
--   trigger bỏ qua insert nếu có lần 'remove' created_at > NEW.assigned_at (theo NGÀY order).
--   => Tự động ép đúng nghĩa "phải ORDER LẠI (sau khi bị gỡ) mới được tag lại":
--      - đơn gần nhất SAU ngày gỡ  → tag lại (đúng).
--      - bị gỡ sau đơn cuối, chưa order lại → CHƯA tag (đúng, chờ order mới).
--   Không cần sửa trigger; nó là guard thời gian, còn chặn theo LOẠI (blacklist) nằm ở hàm dưới.

CREATE OR REPLACE FUNCTION public.sync_order_tags(p_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '90s'
AS $function$
declare v_ins int;
begin
  create temp table _cand on commit drop as
  select distinct on (uname, brand_name) uname, brand_name, staff_name, shop_id, adate
  from (
    select lower(regexp_replace(d.koc_id_kenh,'^@','')) as uname,
           case b.ten_brand when 'HEALMI' then 'HEALMII' else b.ten_brand end as brand_name,
           coalesce(n.ten_nhansu,'') as staff_name, d.ngay_gui::date as adate, cbs.shop_id
    from donguis d
    join chitiettonguis ct on ct.dongui_id = d.id
    join sanphams sp on sp.id = ct.sanpham_id
    join brands b on b.id = sp.brand_id
    join cast_brand_shop cbs on cbs.brand = b.ten_brand
    left join nhansu n on n.id = d.nhansu_id
    where coalesce(d.koc_id_kenh,'') <> '' and d.ngay_gui >= now() - (p_days || ' days')::interval
  ) x where x.staff_name <> ''
  order by uname, brand_name, adate desc;

  -- (A) INSERT tag MỚI: chưa có tag brand đó + KÊNH KHÔNG đang blacklist. Không còn cooldown 30 ngày.
  with elig as (
    select c.* from _cand c
    where not exists (select 1 from koc_brand_assignments a where a.koc_id = c.uname and a.brand_name = c.brand_name)
      and not exists (select 1 from koc_blacklist bl
                       where lower(regexp_replace(bl.id_kenh,'^@','')) = c.uname)
  ),
  ins as (
    insert into koc_brand_assignments (koc_id, brand_name, staff_name, assigned_at, last_order_at, updated_at, status, approved_by, approved_at)
    select uname, brand_name, staff_name, adate, adate, now(), 'approved', 'auto-order', now() from elig
    returning koc_id, brand_name, staff_name
  ),
  hist as (
    insert into koc_assignment_history (koc_id, brand_name, staff_name, action, actor)
    select koc_id, brand_name, staff_name, 'assign', 'auto-order' from ins returning 1
  )
  select count(*) into v_ins from hist;

  -- (B) reset last_order_at cho tag đã có bị order lại.
  update koc_brand_assignments a
  set last_order_at = greatest(coalesce(a.last_order_at, c.adate), c.adate), updated_at = now()
  from _cand c
  where a.koc_id = c.uname and a.brand_name = c.brand_name
    and (a.last_order_at is null or a.last_order_at < c.adate);

  -- (C) tag auto-order chưa air → đổi chủ sang đơn gần nhất.
  update koc_brand_assignments a
  set assigned_at = c.adate, staff_name = c.staff_name, updated_at = now(), approved_at = now()
  from _cand c
  where a.koc_id = c.uname and a.brand_name = c.brand_name
    and a.approved_by = 'auto-order'
    and a.assigned_at::date < c.adate
    and not exists (select 1 from koc_video_unit v where v.uname = c.uname and v.shop_id = c.shop_id);

  return v_ins;
end $function$;

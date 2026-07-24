-- 24/7/2026 — Xóa đơn thì HOÀN TÁC tag mà đơn đó tạo/refresh.
-- Trước đây handleDeleteOrder (AppDataContext.jsx) chỉ xoá bookings/chitiet/dongui, KHÔNG đụng tag
-- => tag auto-order + last_order_at do đơn đó tạo còn nguyên => koc_owes_clip_brands tưởng KOC đang
--    nợ clip => CHẶN order lại (ca @inh.qunh.nh02/BODYMISS: "order 0 ngày trước, xoá đơn rồi vẫn bị").
-- Gọi resync_koc_order_tags(kênh) NGAY sau khi xoá đơn (client rpc).
--
-- Nguyên tắc: với MỖI tag của KOC, tính lại last_order_at theo đơn CÒN LẠI trong TENURE hiện tại
-- (đơn có ngay_gui > lần 'remove' gần nhất của brand — đơn thuộc đời tag trước đã bị gỡ thì bỏ):
--   • còn đơn tenure                         -> set last_order_at = ngày đơn mới nhất còn lại (rollback)
--   • hết đơn tenure + auto-order + chưa air  -> GỠ tag mồ côi. KHÔNG ghi history 'remove'
--       (remove CÙNG NGÀY sẽ khiến trigger zombie chặn re-tag khi nhân sự order lại NGAY hôm nay).
--   • hết đơn tenure nhưng tag TAY / đã air   -> giữ tag, chỉ nhả khoá nợ clip (last_order_at=null).

CREATE OR REPLACE FUNCTION public.resync_koc_order_tags(p_channel text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_removed int := 0; uname text;
begin
  uname := lower(regexp_replace(coalesce(p_channel,''),'^@',''));
  if uname = '' then return 0; end if;

  create temp table _lo on commit drop as
  select a.koc_id, a.brand_name, a.approved_by,
    (select max(cbs.shop_id) from cast_brand_shop cbs where cbs.brand = a.brand_name) as shop_id,
    (select max(d.ngay_gui::date)
       from donguis d
       join chitiettonguis ct on ct.dongui_id = d.id
       join sanphams sp on sp.id = ct.sanpham_id
       join brands b on b.id = sp.brand_id
      where lower(regexp_replace(coalesce(d.koc_id_kenh,''),'^@','')) = a.koc_id
        and (case b.ten_brand when 'HEALMI' then 'HEALMII' else b.ten_brand end) = a.brand_name
        and d.ngay_gui > coalesce(
          (select max(h.created_at) from koc_assignment_history h
            where h.koc_id = a.koc_id and h.brand_name = a.brand_name and h.action = 'remove'),
          '1970-01-01'::timestamptz)
    ) as last_order
  from koc_brand_assignments a
  where a.koc_id = uname;

  update koc_brand_assignments a
  set last_order_at = lo.last_order, updated_at = now()
  from _lo lo
  where a.koc_id = lo.koc_id and a.brand_name = lo.brand_name
    and lo.last_order is not null and a.last_order_at is distinct from lo.last_order;

  with del as (
    delete from koc_brand_assignments a using _lo lo
    where a.koc_id = lo.koc_id and a.brand_name = lo.brand_name
      and lo.last_order is null and lo.approved_by = 'auto-order'
      and not exists (select 1 from koc_video_unit v where v.uname = lo.koc_id and v.shop_id = lo.shop_id)
    returning 1
  )
  select count(*) into v_removed from del;

  update koc_brand_assignments a
  set last_order_at = null, updated_at = now()
  from _lo lo
  where a.koc_id = lo.koc_id and a.brand_name = lo.brand_name
    and lo.last_order is null and a.last_order_at is not null;

  return v_removed;
end $function$;

grant execute on function public.resync_koc_order_tags(text) to anon, authenticated;

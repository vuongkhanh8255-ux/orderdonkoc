-- Báo cáo Booking theo nhân sự (tab "Báo cáo nhân sự", thay tab "Phân tích sản phẩm booking").
-- Gộp Module 1 (đơn gửi/donguis) + Hiệu suất KOC affiliate (qua phần gắn KOC koc_brand_assignments).
-- Trả về mỗi nhân sự: số đơn/mẫu gửi, tần suất/ngày, SP chính, phân bổ brand, danh sách KOC gắn,
--   GMV affiliate (đúng shop của brand) trong kỳ, số video ĐĂNG trong kỳ, view.
-- SECURITY DEFINER vì gọi từ frontend (anon) nhưng đọc tiktok_affiliate_orders (bảng server-only).
-- Đã apply lên DB 2026-06-16.
create or replace function public.staff_booking_report(p_month int, p_year int)
returns table(
  nhansu_id uuid, ten_nhansu text,
  so_don bigint, so_mau numeric, so_ngay bigint, tan_suat numeric,
  top_product text, brand_dist jsonb,
  koc_count bigint, koc_list jsonb,
  aff_gmv numeric, aff_videos bigint, aff_views numeric
)
language sql stable
security definer
set search_path to 'public'
set statement_timeout to '20s'
as $function$
  with rng as (select make_date(p_year,p_month,1) as s, (make_date(p_year,p_month,1)+interval '1 month')::date as e),
  brand_map(brand_name, shop_id) as (values
    ('BODYMISS','7495107349171898427'), ('EHERB','7494529979361168222'),
    ('EHERB HCM','7495838925500090511'), ('MILAGANICS','7494813818973817115'),
    ('MOAW MOAWS','7495831977917385095'), ('HEALMI','7494251668499498533')
  ),
  ord as (
    select dg.nhansu_id, count(distinct dg.id) as so_don, count(distinct dg.ngay_gui::date) as so_ngay
    from donguis dg, rng
    where dg.ngay_gui >= rng.s and dg.ngay_gui < rng.e and dg.nhansu_id is not null
    group by dg.nhansu_id
  ),
  det as (
    select dg.nhansu_id, ct.so_luong, sp.ten_sanpham, b.ten_brand
    from donguis dg
    join chitiettonguis ct on ct.dongui_id = dg.id
    left join sanphams sp on ct.sanpham_id = sp.id
    left join brands b on sp.brand_id = b.id, rng
    where dg.ngay_gui >= rng.s and dg.ngay_gui < rng.e and dg.nhansu_id is not null
  ),
  samp as (select nhansu_id, sum(so_luong) as so_mau from det group by nhansu_id),
  topp as (
    select nhansu_id, ten_sanpham, row_number() over (partition by nhansu_id order by sum(so_luong) desc) as rn
    from det where ten_sanpham is not null group by nhansu_id, ten_sanpham
  ),
  bdist as (
    select nhansu_id, jsonb_object_agg(ten_brand, q) as dist
    from (select nhansu_id, ten_brand, sum(so_luong) as q from det where ten_brand is not null group by nhansu_id, ten_brand) z
    group by nhansu_id
  ),
  sa as (
    select distinct n.id as nhansu_id, lower(regexp_replace(a.koc_id,'^@','')) as uname, bm.shop_id
    from koc_brand_assignments a
    join nhansu n on lower(trim(n.ten_nhansu)) = lower(trim(a.staff_name))
    left join brand_map bm on bm.brand_name = a.brand_name
    where a.status = 'approved'
  ),
  koc as (select nhansu_id, count(distinct uname) as koc_count, jsonb_agg(distinct uname) as koc_list from sa group by nhansu_id),
  aff as (
    select sa.nhansu_id, coalesce(sum(o.price_amount*o.quantity),0) as gmv
    from sa join tiktok_affiliate_orders o on o.shop_id = sa.shop_id
      and lower(regexp_replace(o.creator_username,'^@','')) = sa.uname, rng
    where sa.shop_id is not null and o.order_date >= rng.s and o.order_date < rng.e
    group by sa.nhansu_id
  ),
  vid as (
    select sa.nhansu_id, count(distinct v.id) as so_video, coalesce(sum(v.views),0) as views
    from sa join tiktok_shop_videos v on v.shop_id = sa.shop_id
      and lower(regexp_replace(coalesce(v.username,''),'^@','')) = sa.uname, rng
    where sa.shop_id is not null and v.post_date >= rng.s and v.post_date < rng.e
    group by sa.nhansu_id
  )
  select n.id, n.ten_nhansu,
    coalesce(o.so_don,0), coalesce(s.so_mau,0), coalesce(o.so_ngay,0),
    case when coalesce(o.so_ngay,0) > 0 then round(o.so_don::numeric / o.so_ngay, 1) else 0 end,
    tp.ten_sanpham, coalesce(bd.dist,'{}'::jsonb),
    coalesce(k.koc_count,0), coalesce(k.koc_list,'[]'::jsonb),
    coalesce(af.gmv,0), coalesce(vd.so_video,0), coalesce(vd.views,0)
  from nhansu n
  left join ord o on o.nhansu_id = n.id
  left join samp s on s.nhansu_id = n.id
  left join topp tp on tp.nhansu_id = n.id and tp.rn = 1
  left join bdist bd on bd.nhansu_id = n.id
  left join koc k on k.nhansu_id = n.id
  left join aff af on af.nhansu_id = n.id
  left join vid vd on vd.nhansu_id = n.id
  where o.nhansu_id is not null or k.nhansu_id is not null
  order by coalesce(af.gmv,0) desc;
$function$;

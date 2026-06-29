-- FIX 29/6/2026: VIEW ở Báo cáo nhân sự (staff_booking_report) trước đây = sum(tiktok_shop_videos.views)
-- của video ĐĂNG TRONG KỲ → KOC không đăng video mới trong kỳ (Video kỳ=0) bị VIEW=0, dù video CŨ vẫn
-- đẻ view trong kỳ. Đổi sang VIEW-THÁNG của MỌI video KOC (tiktok_video_monthly_views) — GIỐNG HỆT tab
-- Hiệu suất KOC (koc_video_views) → 2 báo cáo khớp nhau, lấy cùng nguồn (cron + Excel nuôi) → ổn định.
-- so_video (Video kỳ) GIỮ NGUYÊN = video đăng trong kỳ. Chỉ đổi cách tính VIEW.
create or replace function public.staff_booking_report(p_from date, p_to date)
 returns table(nhansu_id uuid, ten_nhansu text, so_don bigint, so_mau numeric, so_ngay bigint, tan_suat numeric, top_product text, brand_dist jsonb, koc_count bigint, koc_list jsonb, aff_gmv numeric, aff_videos bigint, aff_views numeric, cast_used numeric, chi_phi_mau numeric)
 language sql stable security definer set search_path to 'public' set statement_timeout to '40s' set work_mem to '256MB'
as $function$
  with rng as (select p_from::timestamptz as ts0, (p_to + 1)::timestamptz as ts1, p_from as d0, p_to as d1),
  months as (select to_char(gs,'YYYY-MM') ym
    from rng, generate_series(date_trunc('month', rng.d0), date_trunc('month', rng.d1), interval '1 month') gs),
  -- eHerb + eHerb HCM TÍNH CHUNG: cả 2 brand đều map sang CẢ 2 shop (sa dùng distinct nên ko đếm đôi).
  brand_map(brand_name, shop_id) as (values
    ('BODYMISS','7495107349171898427'),
    ('EHERB','7494529979361168222'), ('EHERB','7495838925500090511'),
    ('EHERB HCM','7494529979361168222'), ('EHERB HCM','7495838925500090511'),
    ('MILAGANICS','7494813818973817115'),
    ('MOAW MOAWS','7495831977917385095'), ('HEALMI','7494251668499498533')),
  latest_col as materialized (
    select h as col from costing_data, jsonb_array_elements_text(headers) h
    where h like 'COSTING T% AMIS V2'
    order by (regexp_match(h, 'T(\d+)\.(\d+) AMIS V2'))[2]::int desc,
             (regexp_match(h, 'T(\d+)\.(\d+) AMIS V2'))[1]::int desc limit 1),
  cost_map as materialized (
    select barcode, max(cost) as cost from (
      select r->>'Mã' as barcode,
        case when trim(replace((r->>lc.col), ',', '')) ~ '^[0-9]+(\.[0-9]+)?$'
             then trim(replace((r->>lc.col), ',', ''))::numeric else null end as cost
      from costing_data cd, latest_col lc, jsonb_array_elements(cd.rows) r where cd.key = 'latest') x
    where barcode is not null and barcode <> '' group by barcode),
  ord as (select dg.nhansu_id, count(distinct dg.id) as so_don, count(distinct dg.ngay_gui::date) as so_ngay
    from donguis dg, rng where dg.ngay_gui >= rng.ts0 and dg.ngay_gui < rng.ts1 and dg.nhansu_id is not null group by dg.nhansu_id),
  det as (select dg.nhansu_id, ct.so_luong, sp.ten_sanpham, b.ten_brand
    from donguis dg join chitiettonguis ct on ct.dongui_id = dg.id
    left join sanphams sp on ct.sanpham_id = sp.id left join brands b on sp.brand_id = b.id, rng
    where dg.ngay_gui >= rng.ts0 and dg.ngay_gui < rng.ts1 and dg.nhansu_id is not null),
  samp as (select nhansu_id, sum(so_luong) as so_mau from det group by nhansu_id),
  topp as (select nhansu_id, ten_sanpham, row_number() over (partition by nhansu_id order by sum(so_luong) desc) as rn
    from det where ten_sanpham is not null group by nhansu_id, ten_sanpham),
  bdist as (select nhansu_id, jsonb_object_agg(ten_brand, q) as dist
    from (select nhansu_id, ten_brand, sum(so_luong) as q from det where ten_brand is not null group by nhansu_id, ten_brand) z group by nhansu_id),
  per_order as (select dg.id, dg.nhansu_id,
      coalesce(sum(cm.cost*1.08*ctg.so_luong),0) + 5000 + case when dg.loai_ship='Hỏa tốc' then 50000 else 20000 end as order_total
    from donguis dg left join chitiettonguis ctg on ctg.dongui_id=dg.id
    left join sanphams sp on ctg.sanpham_id=sp.id left join cost_map cm on cm.barcode=sp.barcode, rng
    where dg.ngay_gui >= rng.ts0 and dg.ngay_gui < rng.ts1 and dg.nhansu_id is not null
    group by dg.id, dg.nhansu_id, dg.loai_ship),
  mau_cost as (select nhansu_id, sum(order_total) as chi_phi_mau from per_order group by nhansu_id),
  sa as (select distinct n.id as nhansu_id, lower(regexp_replace(a.koc_id,'^@','')) as uname, bm.shop_id
    from koc_brand_assignments a join nhansu n on lower(trim(n.ten_nhansu)) = lower(trim(a.staff_name))
    left join brand_map bm on bm.brand_name = a.brand_name where a.status = 'approved'),
  koc as (select nhansu_id, count(distinct uname) as koc_count, jsonb_agg(distinct uname) as koc_list from sa group by nhansu_id),
  aff as (select sa.nhansu_id, coalesce(sum(o.price_amount*o.quantity),0) as gmv
    from sa join tiktok_affiliate_orders o on o.shop_id = sa.shop_id and lower(regexp_replace(o.creator_username,'^@','')) = sa.uname, rng
    where sa.shop_id is not null and o.order_date >= rng.d0 and o.order_date <= rng.d1 group by sa.nhansu_id),
  -- Video KỲ (đăng trong kỳ) — giữ nguyên
  vid as (select sa.nhansu_id, count(distinct v.id) as so_video
    from sa join tiktok_shop_videos v on v.shop_id = sa.shop_id and lower(regexp_replace(coalesce(v.username,''),'^@','')) = sa.uname, rng
    where sa.shop_id is not null and v.post_date >= rng.d0 and v.post_date <= rng.d1 group by sa.nhansu_id),
  -- VIEW = view-THÁNG của MỌI video KOC trong các tháng của kỳ (giống koc_video_views) — KHÔNG bó theo post_date
  vid_v as (select sa.nhansu_id, coalesce(sum(mv.views),0) as views
    from sa join tiktok_shop_videos v on v.shop_id = sa.shop_id and lower(regexp_replace(coalesce(v.username,''),'^@','')) = sa.uname
    join tiktok_video_monthly_views mv on mv.id = v.id and mv.ym in (select ym from months)
    where sa.shop_id is not null group by sa.nhansu_id),
  cst as (select n.id as nhansu_id, coalesce(sum(p.cast_net),0) as cast_used
    from koc_payments p join nhansu n on lower(trim(n.ten_nhansu)) = lower(trim(p.staff)), rng
    where p.pay_date >= rng.d0 and p.pay_date <= rng.d1 group by n.id)
  select n.id, n.ten_nhansu,
    coalesce(o.so_don,0), coalesce(s.so_mau,0), coalesce(o.so_ngay,0),
    case when coalesce(o.so_ngay,0) > 0 then round(o.so_don::numeric / o.so_ngay, 1) else 0 end,
    tp.ten_sanpham, coalesce(bd.dist,'{}'::jsonb),
    coalesce(k.koc_count,0), coalesce(k.koc_list,'[]'::jsonb),
    coalesce(af.gmv,0), coalesce(vd.so_video,0), coalesce(vv.views,0), coalesce(cu.cast_used,0), coalesce(mc.chi_phi_mau,0)
  from nhansu n
  left join ord o on o.nhansu_id=n.id left join samp s on s.nhansu_id=n.id
  left join topp tp on tp.nhansu_id=n.id and tp.rn=1 left join bdist bd on bd.nhansu_id=n.id
  left join mau_cost mc on mc.nhansu_id=n.id
  left join koc k on k.nhansu_id=n.id left join aff af on af.nhansu_id=n.id
  left join vid vd on vd.nhansu_id=n.id
  left join vid_v vv on vv.nhansu_id=n.id
  left join cst cu on cu.nhansu_id=n.id
  where (o.nhansu_id is not null or k.nhansu_id is not null or cu.nhansu_id is not null)
    and n.id not in ('04b2e08d-7ff6-4020-a699-b619ae746852','d42754b4-1c5d-42c6-82a5-861a470090ff')
  order by coalesce(af.gmv,0) desc;
$function$;
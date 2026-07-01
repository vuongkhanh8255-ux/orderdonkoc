-- REAL STEEL = GIAN ĐỘC LẬP (shop_id 7496180170889726491), tách hẳn khỏi gian Body Miss.
-- Trước đây Real Steel bán ké gian Body Miss → các brand_map hardcode trỏ REAL STEEL về 7495107349171898427.
-- Sau khi kết nối gian TikTok Real Steel riêng → trỏ REAL STEEL về gian của chính nó ở MỌI nơi hardcode.
-- Đồng thời: so brand bỏ qua hoa/thường + khoảng trắng (staff_booking_report) để brand gõ lệch không rớt KOC.
-- (cast_brand_shop seed riêng trong cast_brand_shop.sql)
-- (staff_booking_detail: xem staff_booking_detail_brand_split_realsteel.sql — bản brand-split MỚI + Real Steel)

-- ── 1) Báo cáo nhân sự (bảng) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_booking_report(p_from date, p_to date)
 RETURNS TABLE(nhansu_id uuid, ten_nhansu text, so_don bigint, so_mau numeric, so_ngay bigint, tan_suat numeric, top_product text, brand_dist jsonb, koc_count bigint, koc_list jsonb, aff_gmv numeric, aff_videos bigint, aff_views numeric, cast_used numeric, chi_phi_mau numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '40s'
 SET work_mem TO '256MB'
AS $function$
  with rng as (select p_from::timestamptz as ts0, (p_to + 1)::timestamptz as ts1, p_from as d0, p_to as d1),
  months as (select to_char(gs,'YYYY-MM') ym
    from rng, generate_series(date_trunc('month', rng.d0), date_trunc('month', rng.d1), interval '1 month') gs),
  brand_map(brand_name, shop_id) as (values
    ('BODYMISS','7495107349171898427'),
    ('REAL STEEL','7496180170889726491'), ('REALSTEEL','7496180170889726491'),
    ('EHERB','7494529979361168222'), ('EHERB','7495838925500090511'),
    ('EHERB HCM','7494529979361168222'), ('EHERB HCM','7495838925500090511'),
    ('MILAGANICS','7494813818973817115'),
    ('MOAW MOAWS','7495831977917385095'),
    ('HEALMII','7494251668499498533'), ('HEALMI','7494251668499498533')),
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
    left join brand_map bm on upper(trim(bm.brand_name)) = upper(trim(a.brand_name)) where a.status = 'approved'),
  koc as (select nhansu_id, count(distinct uname) as koc_count, jsonb_agg(distinct uname) as koc_list from sa group by nhansu_id),
  aff as (select sa.nhansu_id, coalesce(sum(o.price_amount*o.quantity),0) as gmv
    from sa join tiktok_affiliate_orders o on o.shop_id = sa.shop_id and lower(regexp_replace(o.creator_username,'^@','')) = sa.uname, rng
    where sa.shop_id is not null and o.order_date >= rng.d0 and o.order_date <= rng.d1 group by sa.nhansu_id),
  vu as (
    select nhansu_id, shop_id, uname, content_id, min(post_eff) as post_eff from (
      select sa.nhansu_id, sa.shop_id, sa.uname, o.content_id as content_id, min(o.order_date)::date as post_eff
        from sa join tiktok_affiliate_orders o on o.shop_id=sa.shop_id and lower(regexp_replace(o.creator_username,'^@',''))=sa.uname
        where o.content_type='VIDEO' and coalesce(o.content_id,'')<>'' group by sa.nhansu_id, sa.shop_id, sa.uname, o.content_id
      union all
      select sa.nhansu_id, sa.shop_id, sa.uname, v.id as content_id, v.post_date as post_eff
        from sa join tiktok_shop_videos v on v.shop_id=sa.shop_id and lower(regexp_replace(coalesce(v.username,''),'^@',''))=sa.uname
    ) z group by nhansu_id, shop_id, uname, content_id),
  vid as (select nhansu_id,
      count(*) filter (where post_eff >= (select d0 from rng) and post_eff <= (select d1 from rng)) as so_video
    from vu group by nhansu_id),
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

-- ── 2) Cảnh báo KOC chưa air video (brand_shop dùng key chuẩn hoá → REALSTEEL) ──
CREATE OR REPLACE FUNCTION public.koc_no_video_warnings()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '20s'
AS $function$
  with rng as (select (now() - interval '14 days')::date as d_late, date '2026-06-01' as d_floor),
  brand_shop(bkey, shop_id) as (values
    ('BODYMISS','7495107349171898427'),
    ('REALSTEEL','7496180170889726491'),
    ('EHERB','7494529979361168222'), ('EHERB','7495838925500090511'),
    ('MILAGANICS','7494813818973817115'),
    ('MOAWMOAWS','7495831977917385095'),
    ('HEALMI','7494251668499498533')),
  ord as (
    select distinct dg.id as dongui_id, trim(dg.koc_id_kenh) as id_kenh,
      lower(trim(regexp_replace(coalesce(dg.koc_id_kenh,''),'^@',''))) as ch,
      upper(regexp_replace(coalesce(b.ten_brand,''),'[^A-Za-z0-9]','','g')) as bkey,
      dg.ngay_gui::date as ngay_gui, n.ten_nhansu as staff
    from donguis dg
    join chitiettonguis ct on ct.dongui_id = dg.id
    join sanphams sp on ct.sanpham_id = sp.id
    join brands b on sp.brand_id = b.id
    left join nhansu n on n.id = dg.nhansu_id, rng
    where dg.ngay_gui::date <= rng.d_late and dg.ngay_gui::date >= rng.d_floor
      and coalesce(trim(dg.koc_id_kenh),'') <> ''
      and not exists (select 1 from koc_video_warning_dismissed x where x.dongui_id = dg.id)
  ),
  vids as materialized (
    select shop_id, ch, post_date from (
      select o.shop_id, lower(regexp_replace(coalesce(o.creator_username,''),'^@','')) as ch, o.order_date::date as post_date
        from tiktok_affiliate_orders o, rng
        where o.shop_id in (select shop_id from brand_shop)
          and o.content_type = 'VIDEO' and coalesce(o.content_id,'') <> '' and o.order_date >= rng.d_floor
      union all
      select v.shop_id, lower(regexp_replace(coalesce(v.username,''),'^@','')) as ch, v.post_date
        from tiktok_shop_videos v, rng
        where v.shop_id in (select shop_id from brand_shop) and v.post_date >= rng.d_floor
    ) z
  ),
  warned as (
    select o.* from ord o
    where o.bkey in (select bkey from brand_shop)
      and not exists (
        select 1 from brand_shop bs join vids vv on vv.shop_id = bs.shop_id and vv.ch = o.ch and vv.post_date >= o.ngay_gui
        where bs.bkey = o.bkey)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'dongui_id', dongui_id, 'id_kenh', id_kenh, 'brand', bkey, 'staff', staff,
    'ngay_gui', to_char(ngay_gui,'DD/MM'), 'days_ago', (current_date - ngay_gui)
  ) order by ngay_gui), '[]'::jsonb)
  from warned;
$function$;

-- ── 3) Trạng thái clip theo KOC×brand ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.koc_clip_status(p_floor date DEFAULT '2026-06-01'::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '25s'
AS $function$
  with brand_shop(bkey, shop_id) as (values
    ('BODYMISS','7495107349171898427'),
    ('REALSTEEL','7496180170889726491'),
    ('EHERB','7494529979361168222'), ('EHERB','7495838925500090511'),
    ('MILAGANICS','7494813818973817115'),
    ('MOAWMOAWS','7495831977917385095'),
    ('HEALMI','7494251668499498533')),
  ord as (
    select dg.id as dongui_id,
      trim(dg.koc_id_kenh) as id_kenh_raw,
      lower(trim(regexp_replace(coalesce(dg.koc_id_kenh,''),'^@',''))) as ch,
      upper(regexp_replace(coalesce(b.ten_brand,''),'[^A-Za-z0-9]','','g')) as bkey,
      dg.ngay_gui::date as ngay_gui, n.ten_nhansu as staff
    from donguis dg
    join chitiettonguis ct on ct.dongui_id = dg.id
    join sanphams sp on ct.sanpham_id = sp.id
    join brands b on sp.brand_id = b.id
    left join nhansu n on n.id = dg.nhansu_id
    where dg.ngay_gui::date >= p_floor and coalesce(trim(dg.koc_id_kenh),'') <> ''
  ),
  grp as (
    select ch, bkey,
      max(id_kenh_raw) as id_kenh,
      count(distinct dongui_id) as so_don,
      min(ngay_gui) as gui_dau, max(ngay_gui) as gui_cuoi,
      (array_agg(staff order by ngay_gui desc))[1] as staff
    from ord group by ch, bkey
  ),
  vids as (
    select bs.bkey, lower(trim(regexp_replace(coalesce(v.username,''),'^@',''))) as ch, v.post_date
    from tiktok_shop_videos v join brand_shop bs on bs.shop_id = v.shop_id
    where v.post_date >= p_floor
  ),
  clip as (
    select g.ch, g.bkey,
      count(vv.post_date) filter (where vv.post_date >= g.gui_dau) as so_clip,
      max(vv.post_date) filter (where vv.post_date >= g.gui_dau) as clip_cuoi
    from grp g left join vids vv on vv.bkey = g.bkey and vv.ch = g.ch
    group by g.ch, g.bkey
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id_kenh', g.id_kenh, 'brand', g.bkey, 'staff', g.staff,
    'so_don', g.so_don,
    'gui_cuoi', to_char(g.gui_cuoi,'DD/MM'),
    'days_ago', (current_date - g.gui_cuoi),
    'mapped', (g.bkey in (select bkey from brand_shop)),
    'so_clip', coalesce(c.so_clip,0),
    'clip_cuoi', to_char(c.clip_cuoi,'DD/MM'),
    'co_clip', coalesce(c.so_clip,0) > 0
  ) order by (coalesce(c.so_clip,0) > 0), g.gui_cuoi desc), '[]'::jsonb)
  from grp g left join clip c on c.ch = g.ch and c.bkey = g.bkey;
$function$;

-- ── 4) Chi tiết clip 1 KOC×brand ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.koc_clip_detail(p_ch text, p_brand text, p_floor date DEFAULT '2026-06-01'::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '15s'
AS $function$
  with brand_shop(bkey, shop_id) as (values
    ('BODYMISS','7495107349171898427'),
    ('REALSTEEL','7496180170889726491'),
    ('EHERB','7494529979361168222'), ('EHERB','7495838925500090511'),
    ('MILAGANICS','7494813818973817115'),
    ('MOAWMOAWS','7495831977917385095'),
    ('HEALMI','7494251668499498533')),
  dons as (
    select dg.id, dg.ngay_gui::date as ngay, dg.san_pham_chi_tiet as sp, n.ten_nhansu as staff
    from donguis dg
    join chitiettonguis ct on ct.dongui_id = dg.id
    join sanphams sp2 on ct.sanpham_id = sp2.id
    join brands b on sp2.brand_id = b.id
    left join nhansu n on n.id = dg.nhansu_id
    where lower(trim(regexp_replace(coalesce(dg.koc_id_kenh,''),'^@',''))) = p_ch
      and upper(regexp_replace(coalesce(b.ten_brand,''),'[^A-Za-z0-9]','','g')) = p_brand
      and dg.ngay_gui::date >= p_floor
    group by dg.id, dg.ngay_gui, dg.san_pham_chi_tiet, n.ten_nhansu
  ),
  clips as (
    select distinct v.id, v.username, v.post_date, v.title,
      coalesce((select sum(mv.views) from tiktok_video_monthly_views mv where mv.id = v.id), 0) as views
    from tiktok_shop_videos v join brand_shop bs on bs.shop_id = v.shop_id
    where lower(trim(regexp_replace(coalesce(v.username,''),'^@',''))) = p_ch
      and bs.bkey = p_brand and v.post_date >= p_floor
  )
  select jsonb_build_object(
    'dons', (select coalesce(jsonb_agg(jsonb_build_object('ngay', to_char(ngay,'DD/MM'), 'sp', sp, 'staff', staff) order by ngay desc), '[]'::jsonb) from dons),
    'clips', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'username', username, 'post', to_char(post_date,'DD/MM/YYYY'), 'views', views, 'title', title) order by post_date desc), '[]'::jsonb) from clips)
  );
$function$;

-- ── 5) Video cần lấp view (nhánh air_links dùng ten_brand 'REAL STEEL') ───────
CREATE OR REPLACE FUNCTION public.koc_views_to_fill(p_shop_id text, p_limit integer DEFAULT 40)
 RETURNS TABLE(video_id text, ym text, username text)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '25s'
AS $function$
  with bm(brand_name, shop_id) as (values
    ('BODYMISS','7495107349171898427'), ('REAL STEEL','7496180170889726491'),
    ('EHERB','7494529979361168222'),
    ('EHERB HCM','7495838925500090511'), ('MILAGANICS','7494813818973817115'),
    ('MOAW MOAWS','7495831977917385095'), ('HEALMI','7494251668499498533')),
  order_src as (
    select content_id as vid, date_trunc('month', order_date)::date as m,
           to_char(order_date, 'YYYY-MM') as ym, max(creator_username) as uname
    from tiktok_affiliate_orders
    where shop_id = p_shop_id and content_type = 'VIDEO' and coalesce(content_id,'') <> '' and order_date >= date '2026-01-01'
    group by content_id, date_trunc('month', order_date)::date, to_char(order_date, 'YYYY-MM')
  ),
  air_src as (
    select al.id_video as vid, date_trunc('month', al.ngay_air)::date as m,
           to_char(al.ngay_air, 'YYYY-MM') as ym, ''::text as uname
    from air_links al join brands b on b.id = al.brand_id join bm on bm.brand_name = b.ten_brand
    where bm.shop_id = p_shop_id and al.id_video ~ '^[0-9]+$'
      and al.ngay_air >= date '2026-01-01' and al.ngay_air <= date '2026-12-31'
    group by al.id_video, date_trunc('month', al.ngay_air)::date, to_char(al.ngay_air, 'YYYY-MM')
  ),
  src as (
    select vid, ym, max(m) as m, max(uname) as uname
    from (select * from order_src union all select * from air_src) z
    group by vid, ym
  )
  select s.vid, s.ym, s.uname
  from src s
  where not exists (select 1 from tiktok_video_monthly_views mv where mv.id = s.vid and mv.ym = s.ym)
  order by s.m desc
  limit greatest(1, least(p_limit, 80));
$function$;

-- Chi tiết 1 nhân sự cho drawer "Báo cáo nhân sự (Booking)" — Phase 2.
-- Trả về jsonb { daily:[{d,don,mau,gmv,video,views}], kocs:[{uname,gmv,views,videos,cast}] }
--   daily: chuỗi theo ngày trong tháng (đủ 30/31 ngày, ngày không có data = 0) → line chart hiệu suất.
--   kocs : per-KOC GMV/view/video/cast → scatter GMV vs CAST + bảng Top KOC.
-- GMV/video theo shop của brand được gắn (giống staff_booking_report). post_date = ngày ĐĂNG video.
-- cast per-KOC: map koc_payments.channel_link (@username) -> creator. cast = sum(cast_net) theo staff+ngày trong kỳ.
-- LƯU Ý: 'cast' là reserved keyword → cột nội bộ đặt cast_amt, chỉ đặt key JSON là 'cast'.
-- SECURITY DEFINER (đọc tiktok_affiliate_orders server-only). Đã apply lên DB 2026-06-17.
create or replace function public.staff_booking_detail(p_nhansu_id uuid, p_month int, p_year int)
returns jsonb language sql stable security definer set search_path to 'public' set statement_timeout to '20s'
as $function$
  with rng as (select make_date(p_year,p_month,1) as s, (make_date(p_year,p_month,1)+interval '1 month')::date as e),
  brand_map(brand_name, shop_id) as (values
    ('BODYMISS','7495107349171898427'), ('EHERB','7494529979361168222'),
    ('EHERB HCM','7495838925500090511'), ('MILAGANICS','7494813818973817115'),
    ('MOAW MOAWS','7495831977917385095'), ('HEALMI','7494251668499498533')),
  sa as (select distinct lower(regexp_replace(a.koc_id,'^@','')) as uname, bm.shop_id
    from koc_brand_assignments a join nhansu n on lower(trim(n.ten_nhansu))=lower(trim(a.staff_name))
    left join brand_map bm on bm.brand_name=a.brand_name
    where n.id = p_nhansu_id and a.status='approved' and bm.shop_id is not null),
  days as (select gs::date as d from generate_series(make_date(p_year,p_month,1)::timestamp, ((make_date(p_year,p_month,1)+interval '1 month')::date - 1)::timestamp, interval '1 day') gs),
  d_ord as (select dg.ngay_gui::date as d, count(distinct dg.id) as don, coalesce(sum(ct.so_luong),0) as mau
    from donguis dg left join chitiettonguis ct on ct.dongui_id=dg.id, rng
    where dg.nhansu_id=p_nhansu_id and dg.ngay_gui>=rng.s and dg.ngay_gui<rng.e group by dg.ngay_gui::date),
  d_gmv as (select o.order_date as d, coalesce(sum(o.price_amount*o.quantity),0) as gmv
    from sa join tiktok_affiliate_orders o on o.shop_id=sa.shop_id and lower(regexp_replace(o.creator_username,'^@',''))=sa.uname, rng
    where o.order_date>=rng.s and o.order_date<rng.e group by o.order_date),
  d_vid as (select v.post_date as d, count(distinct v.id) as video, coalesce(sum(v.views),0) as views
    from sa join tiktok_shop_videos v on v.shop_id=sa.shop_id and lower(regexp_replace(coalesce(v.username,''),'^@',''))=sa.uname, rng
    where v.post_date>=rng.s and v.post_date<rng.e group by v.post_date),
  daily as (select days.d, coalesce(o.don,0) as don, coalesce(o.mau,0) as mau, coalesce(g.gmv,0) as gmv, coalesce(vd.video,0) as video, coalesce(vd.views,0) as views
    from days left join d_ord o on o.d=days.d left join d_gmv g on g.d=days.d left join d_vid vd on vd.d=days.d),
  k_gmv as (select sa.uname, coalesce(sum(o.price_amount*o.quantity),0) as gmv
    from sa join tiktok_affiliate_orders o on o.shop_id=sa.shop_id and lower(regexp_replace(o.creator_username,'^@',''))=sa.uname, rng
    where o.order_date>=rng.s and o.order_date<rng.e group by sa.uname),
  k_vid as (select sa.uname, count(distinct v.id) as videos, coalesce(sum(v.views),0) as views
    from sa join tiktok_shop_videos v on v.shop_id=sa.shop_id and lower(regexp_replace(coalesce(v.username,''),'^@',''))=sa.uname, rng
    where v.post_date>=rng.s and v.post_date<rng.e group by sa.uname),
  k_cast as (select lower((regexp_match(p.channel_link, '@([^/?#]+)'))[1]) as uname, sum(p.cast_net) as cast_amt
    from koc_payments p join nhansu n on lower(trim(n.ten_nhansu))=lower(trim(p.staff)), rng
    where n.id=p_nhansu_id and p.pay_date>=rng.s and p.pay_date<rng.e and p.channel_link is not null group by 1),
  unames as (select uname from sa union select uname from k_cast where uname is not null),
  kocs as (select u.uname, coalesce(g.gmv,0) as gmv, coalesce(vd.views,0) as views, coalesce(vd.videos,0) as videos, coalesce(c.cast_amt,0) as cast_amt
    from unames u left join k_gmv g on g.uname=u.uname left join k_vid vd on vd.uname=u.uname left join k_cast c on c.uname=u.uname
    where coalesce(g.gmv,0)>0 or coalesce(vd.videos,0)>0 or coalesce(c.cast_amt,0)>0)
  select jsonb_build_object(
    'daily', coalesce((select jsonb_agg(jsonb_build_object('d', to_char(d,'DD/MM'), 'don', don, 'mau', mau, 'gmv', gmv, 'video', video, 'views', views) order by d) from daily), '[]'::jsonb),
    'kocs', coalesce((select jsonb_agg(jsonb_build_object('uname', uname, 'gmv', gmv, 'views', views, 'videos', videos, 'cast', cast_amt) order by gmv desc) from kocs), '[]'::jsonb)
  );
$function$;

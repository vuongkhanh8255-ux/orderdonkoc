-- FIX 29/6/2026 (đi kèm staff_booking_report_view_monthly.sql): VIEW per-KOC ở DRILL-DOWN Báo cáo
-- nhân sự (staff_booking_detail, CTE k_vid) trước đây = sum(tiktok_shop_videos.views) của video ĐĂNG
-- TRONG KỲ → KOC không đăng video mới trong kỳ bị VIEW=0 dù video CŨ vẫn đẻ view. Đổi sang VIEW-THÁNG
-- của MỌI video KOC (tiktok_video_monthly_views), giống koc_video_views (tab Hiệu suất KOC) → khớp nhau.
-- videos_total / videos_period (Video tổng/kỳ) GIỮ NGUYÊN. Daily chart 'views' (d_vid) giữ nguyên vì
-- view-tháng không bẻ theo NGÀY được.
create or replace function public.staff_booking_detail(p_nhansu_id uuid, p_from date, p_to date)
 returns jsonb language sql stable security definer set search_path to 'public' set statement_timeout to '30s' set work_mem to '256MB'
as $function$
  with rng as (select p_from::timestamptz as ts0, (p_to + 1)::timestamptz as ts1, p_from as d0, p_to as d1),
  months as (select to_char(gs,'YYYY-MM') ym
    from rng, generate_series(date_trunc('month', rng.d0), date_trunc('month', rng.d1), interval '1 month') gs),
  brand_map(brand_name, shop_id) as (values
    ('BODYMISS','7495107349171898427'), ('EHERB','7494529979361168222'),
    ('EHERB HCM','7495838925500090511'), ('MILAGANICS','7494813818973817115'),
    ('MOAW MOAWS','7495831977917385095'), ('HEALMI','7494251668499498533')),
  sa as (select distinct lower(regexp_replace(a.koc_id,'^@','')) as uname, bm.shop_id
    from koc_brand_assignments a join nhansu n on lower(trim(n.ten_nhansu))=lower(trim(a.staff_name))
    left join brand_map bm on bm.brand_name=a.brand_name
    where n.id = p_nhansu_id and a.status='approved' and bm.shop_id is not null),
  days as (select gs::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') gs),
  d_ord as (select dg.ngay_gui::date as d, count(distinct dg.id) as don, coalesce(sum(ct.so_luong),0) as mau
    from donguis dg left join chitiettonguis ct on ct.dongui_id=dg.id, rng
    where dg.nhansu_id=p_nhansu_id and dg.ngay_gui>=rng.ts0 and dg.ngay_gui<rng.ts1 group by dg.ngay_gui::date),
  d_gmv as (select o.order_date as d, coalesce(sum(o.price_amount*o.quantity),0) as gmv
    from sa join tiktok_affiliate_orders o on o.shop_id=sa.shop_id and lower(regexp_replace(o.creator_username,'^@',''))=sa.uname, rng
    where o.order_date>=rng.d0 and o.order_date<=rng.d1 group by o.order_date),
  d_vid as (select v.post_date as d, count(distinct v.id) as video, coalesce(sum(v.views),0) as views
    from sa join tiktok_shop_videos v on v.shop_id=sa.shop_id and lower(regexp_replace(coalesce(v.username,''),'^@',''))=sa.uname, rng
    where v.post_date>=rng.d0 and v.post_date<=rng.d1 group by v.post_date),
  daily as (select days.d, coalesce(o.don,0) as don, coalesce(o.mau,0) as mau, coalesce(g.gmv,0) as gmv, coalesce(vd.video,0) as video, coalesce(vd.views,0) as views
    from days left join d_ord o on o.d=days.d left join d_gmv g on g.d=days.d left join d_vid vd on vd.d=days.d),
  k_gmv as (select sa.uname, coalesce(sum(o.price_amount*o.quantity),0) as gmv
    from sa join tiktok_affiliate_orders o on o.shop_id=sa.shop_id and lower(regexp_replace(o.creator_username,'^@',''))=sa.uname, rng
    where o.order_date>=rng.d0 and o.order_date<=rng.d1 group by sa.uname),
  k_vid as (select sa.uname, coalesce(sum(mv.views),0) as views
    from sa join tiktok_shop_videos v on v.shop_id=sa.shop_id and lower(regexp_replace(coalesce(v.username,''),'^@',''))=sa.uname
    join tiktok_video_monthly_views mv on mv.id=v.id and mv.ym in (select ym from months)
    group by sa.uname),
  k_vu as (
    select uname, content_id, min(post_eff) as post_eff from (
      select sa.uname, o.content_id as content_id, min(o.order_date)::date as post_eff
        from sa join tiktok_affiliate_orders o on o.shop_id=sa.shop_id and lower(regexp_replace(o.creator_username,'^@',''))=sa.uname
        where o.content_type='VIDEO' and coalesce(o.content_id,'')<>'' group by sa.uname, o.content_id
      union all
      select sa.uname, v.id as content_id, v.post_date as post_eff
        from sa join tiktok_shop_videos v on v.shop_id=sa.shop_id and lower(regexp_replace(coalesce(v.username,''),'^@',''))=sa.uname
    ) z group by uname, content_id),
  k_vtot as (select uname, count(*) as videos_total,
      count(*) filter (where post_eff is not null and post_eff >= (select d0 from rng) and post_eff <= (select d1 from rng)) as videos_period
    from k_vu group by uname),
  k_cast as (select lower((regexp_match(p.channel_link, '@([^/?#]+)'))[1]) as uname, sum(p.cast_net) as cast_amt
    from koc_payments p join nhansu n on lower(trim(n.ten_nhansu))=lower(trim(p.staff)), rng
    where n.id=p_nhansu_id and p.pay_date>=rng.d0 and p.pay_date<=rng.d1 and p.channel_link is not null group by 1),
  unames as (select uname from sa union select uname from k_cast where uname is not null),
  kocs as (select u.uname, coalesce(g.gmv,0) as gmv, coalesce(vd.views,0) as views,
      coalesce(vt.videos_period,0) as videos, coalesce(vt.videos_total,0) as videos_total, coalesce(c.cast_amt,0) as cast_amt
    from unames u left join k_gmv g on g.uname=u.uname left join k_vid vd on vd.uname=u.uname
      left join k_vtot vt on vt.uname=u.uname left join k_cast c on c.uname=u.uname
    where coalesce(g.gmv,0)>0 or coalesce(vt.videos_total,0)>0 or coalesce(c.cast_amt,0)>0)
  select jsonb_build_object(
    'daily', coalesce((select jsonb_agg(jsonb_build_object('d', to_char(d,'DD/MM'), 'don', don, 'mau', mau, 'gmv', gmv, 'video', video, 'views', views) order by d) from daily), '[]'::jsonb),
    'kocs', coalesce((select jsonb_agg(jsonb_build_object('uname', uname, 'gmv', gmv, 'views', views, 'videos', videos, 'videos_total', videos_total, 'cast', cast_amt) order by gmv desc) from kocs), '[]'::jsonb)
  );
$function$;
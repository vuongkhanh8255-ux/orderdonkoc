-- 1/7/2026 — TÁCH KOC THEO BRAND ở bảng "Top KOC theo GMV" (drill-down Báo cáo nhân sự).
-- Trước: 1 KOC = 1 dòng, gộp mọi brand → không biết brand nào KOC chưa air để đẩy.
-- Nay: 1 KOC × 1 brand (canonical) = 1 dòng riêng. Brand canonical: EHERB*(VN+HCM)→EHERB (chung shop),
-- HEALMI*→HEALMI, MOAW*→MOAW. Trả thêm: brand, last_air (ngày air gần nhất all-time), since (ngày gắn).
-- Khớp Khánh chốt 1/7: "thời gian bị gỡ tag" = last_air + 45 ngày (air là gia hạn); chưa air → since + 45. (UI tính).
-- daily/GMV tổng của nhân sự KHÔNG đổi (chỉ bảng KOC tách theo brand).
create or replace function public.staff_booking_detail(p_nhansu_id uuid, p_from date, p_to date)
 returns jsonb language sql stable security definer set search_path to 'public' set statement_timeout to '30s' set work_mem to '256MB'
as $function$
  with rng as (select p_from::timestamptz as ts0, (p_to + 1)::timestamptz as ts1, p_from as d0, p_to as d1),
  months as (select to_char(gs,'YYYY-MM') ym
    from rng, generate_series(date_trunc('month', rng.d0), date_trunc('month', rng.d1), interval '1 month') gs),
  -- brand CANONICAL -> shop(s). eHerb VN+HCM CHUNG 2 shop; Healmi/Healmii; Moaw.
  brand_map(brand_canon, shop_id) as (values
    ('BODYMISS','7495107349171898427'),
    ('EHERB','7494529979361168222'), ('EHERB','7495838925500090511'),
    ('MILAGANICS','7494813818973817115'),
    ('MOAW','7495831977917385095'),
    ('HEALMI','7494251668499498533')),
  -- assignment của nhân sự này, brand canonical hoá + ngày gắn (since)
  asg as (select lower(regexp_replace(a.koc_id,'^@','')) as uname,
      case when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%'  then 'EHERB'
           when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
           when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'MOAW%'   then 'MOAW'
           else upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) end as brand_canon,
      max(coalesce(a.approved_at, a.assigned_at)) as since
    from koc_brand_assignments a join nhansu n on lower(trim(n.ten_nhansu))=lower(trim(a.staff_name))
    where n.id = p_nhansu_id and a.status='approved'
    group by 1,2),
  -- (uname, brand_canon, shop) để join hoạt động theo brand
  sa as (select distinct asg.uname, asg.brand_canon, bm.shop_id
    from asg join brand_map bm on bm.brand_canon = asg.brand_canon),
  -- cast theo brand (canonical), lọc theo pay_date (giữ nguyên logic cột CAST cũ)
  cast_p as (select lower((regexp_match(p.channel_link, '@([^/?#]+)'))[1]) as uname,
      case when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'EHERB%'  then 'EHERB'
           when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
           when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'MOAW%'   then 'MOAW'
           else upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) end as brand_canon,
      sum(p.cast_net) as cast_amt
    from koc_payments p join nhansu n on lower(trim(n.ten_nhansu))=lower(trim(p.staff)), rng
    where n.id=p_nhansu_id and p.pay_date>=rng.d0 and p.pay_date<=rng.d1
      and p.channel_link is not null and coalesce(p.cast_net,0)<>0 group by 1,2),
  -- ── daily (tổng nhân sự, KHÔNG tách brand) ──
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
  -- ── per (uname, brand) ──
  p_gmv as (select sa.uname, sa.brand_canon, coalesce(sum(o.price_amount*o.quantity),0) as gmv
    from sa join tiktok_affiliate_orders o on o.shop_id=sa.shop_id and lower(regexp_replace(o.creator_username,'^@',''))=sa.uname, rng
    where o.order_date>=rng.d0 and o.order_date<=rng.d1 group by 1,2),
  p_view as (select sa.uname, sa.brand_canon, coalesce(sum(mv.views),0) as views
    from sa join tiktok_shop_videos v on v.shop_id=sa.shop_id and lower(regexp_replace(coalesce(v.username,''),'^@',''))=sa.uname
    join tiktok_video_monthly_views mv on mv.id=v.id and mv.ym in (select ym from months)
    group by 1,2),
  vu as (
    select uname, brand_canon, content_id, min(post_eff) as post_eff from (
      select sa.uname, sa.brand_canon, o.content_id as content_id, min(o.order_date)::date as post_eff
        from sa join tiktok_affiliate_orders o on o.shop_id=sa.shop_id and lower(regexp_replace(o.creator_username,'^@',''))=sa.uname
        where o.content_type='VIDEO' and coalesce(o.content_id,'')<>'' group by sa.uname, sa.brand_canon, o.content_id
      union all
      select sa.uname, sa.brand_canon, v.id as content_id, v.post_date as post_eff
        from sa join tiktok_shop_videos v on v.shop_id=sa.shop_id and lower(regexp_replace(coalesce(v.username,''),'^@',''))=sa.uname
    ) z group by uname, brand_canon, content_id),
  p_vtot as (select uname, brand_canon, count(*) as videos_total,
      count(*) filter (where post_eff is not null and post_eff >= (select d0 from rng) and post_eff <= (select d1 from rng)) as videos_period,
      max(post_eff) as last_air
    from vu group by uname, brand_canon),
  -- neo dòng = mọi cặp (uname, brand) có định danh HOẶC có cast
  pairs as (select uname, brand_canon from asg
            union select uname, brand_canon from cast_p where uname is not null),
  kocs as (select pr.uname, pr.brand_canon as brand,
      coalesce(g.gmv,0) as gmv, coalesce(vw.views,0) as views,
      coalesce(vt.videos_period,0) as videos, coalesce(vt.videos_total,0) as videos_total,
      coalesce(c.cast_amt,0) as cast_amt, vt.last_air, ag.since
    from pairs pr
    left join p_gmv g   on g.uname=pr.uname  and g.brand_canon=pr.brand_canon
    left join p_view vw on vw.uname=pr.uname and vw.brand_canon=pr.brand_canon
    left join p_vtot vt on vt.uname=pr.uname and vt.brand_canon=pr.brand_canon
    left join cast_p c  on c.uname=pr.uname  and c.brand_canon=pr.brand_canon
    left join asg ag    on ag.uname=pr.uname and ag.brand_canon=pr.brand_canon
    where coalesce(g.gmv,0)>0 or coalesce(vt.videos_total,0)>0 or coalesce(c.cast_amt,0)>0)
  select jsonb_build_object(
    'daily', coalesce((select jsonb_agg(jsonb_build_object('d', to_char(d,'DD/MM'), 'don', don, 'mau', mau, 'gmv', gmv, 'video', video, 'views', views) order by d) from daily), '[]'::jsonb),
    'kocs', coalesce((select jsonb_agg(jsonb_build_object(
        'uname', uname, 'brand', brand, 'gmv', gmv, 'views', views, 'videos', videos,
        'videos_total', videos_total, 'cast', cast_amt, 'last_air', last_air, 'since', since
      ) order by gmv desc) from kocs), '[]'::jsonb)
  );
$function$;
grant execute on function public.staff_booking_detail(uuid,date,date) to anon, authenticated;

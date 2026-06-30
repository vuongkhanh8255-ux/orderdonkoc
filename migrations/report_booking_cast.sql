-- Ngân sách ĐÃ CHI (cast booking) theo BRAND cho Báo cáo tổng quan (ReportTab). Cast = koc_payments.cast_net,
-- xếp theo NGÀY AIR = coalesce(air_date_manual, tiktok_shop_videos.post_date, pay_date) — KHỚP định nghĩa
-- Module 7 / Tạm đối chiếu. Brand chuẩn hóa (upper+alnum) + GỘP: EHERB* → EHERB, HEALMI* → HEALMI, MOAW* → MOAW.
-- ReportTab map brand.key → canon (xem CAST_CANON trong ReportTab.jsx).
create or replace function public.report_booking_cast(p_from date, p_to date)
returns table(brand_canon text, cast_net numeric)
language sql stable security definer set search_path to 'public' set statement_timeout to '30s'
as $function$
  with pay as (
    select kp.brand, kp.cast_net, kp.air_date_manual, kp.pay_date,
           nullif(substring(kp.air_link from 'video/([0-9]+)'), '') as vid
    from koc_payments kp where coalesce(kp.cast_net,0) <> 0
  ),
  res as (
    select case
        when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
        when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
        when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
        else upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g'))
      end as brand_canon,
      p.cast_net,
      coalesce(p.air_date_manual, vd.post_date, p.pay_date) as air_dt
    from pay p
    left join lateral (select max(post_date) as post_date from tiktok_shop_videos where id = p.vid) vd on true
  )
  select brand_canon, sum(cast_net)::numeric
  from res where air_dt is not null and air_dt >= p_from and air_dt <= p_to
  group by brand_canon;
$function$;
grant execute on function public.report_booking_cast(date,date) to anon, authenticated;

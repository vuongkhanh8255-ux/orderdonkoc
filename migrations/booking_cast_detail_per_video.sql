-- MODULE 7 — drill-down: chi tiết cast TỪNG VIDEO của 1 nhân sự (quy theo tháng video air, từ koc_payments).
-- TỐI ƯU LATERAL + index (giống booking_cast_by_month) để không bị statement timeout. id/id_video đều TEXT.
-- Đã apply lên DB 2026-06-20.
create or replace function public.booking_cast_detail(p_staff text, p_from date, p_to date)
returns table(channel_link text, air_link text, cast_net numeric, air_date date, pay_date date, brand text, paid boolean)
language sql stable security definer set search_path to 'public' set statement_timeout to '30s'
as $function$
  with pay as (
    select kp.channel_link, kp.air_link, kp.cast_net, kp.pay_date, kp.brand, kp.paid,
           nullif(substring(kp.air_link from 'video/([0-9]+)'), '') as vid
    from koc_payments kp
    where kp.staff is not null and trim(kp.staff) = trim(p_staff)
  ),
  res as (
    select p.channel_link, p.air_link, p.cast_net, p.pay_date, p.brand, p.paid,
           coalesce(vd.post_date, ad.ngay_air) as air_date
    from pay p
    left join lateral (select max(post_date) as post_date from tiktok_shop_videos where id = p.vid) vd on true
    left join lateral (select max(ngay_air)  as ngay_air  from air_links where id_video = p.vid and ngay_air is not null and ngay_air <= date '2026-12-31') ad on true
  )
  select channel_link, air_link, cast_net, air_date, pay_date, brand, paid
  from res
  where air_date is not null and air_date >= p_from and air_date <= p_to
  order by air_date desc;
$function$;
grant execute on function public.booking_cast_detail(text,date,date) to anon, authenticated;

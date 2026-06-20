-- MODULE 7 — drill-down: chi tiết cast TỪNG VIDEO của 1 nhân sự (quy theo tháng video air, từ koc_payments).
-- Đã apply lên DB 2026-06-20.
create or replace function public.booking_cast_detail(p_staff text, p_from date, p_to date)
returns table(channel_link text, air_link text, cast_net numeric, air_date date, pay_date date, brand text, paid boolean)
language sql stable security definer set search_path to 'public' set statement_timeout to '20s'
as $function$
  with pay as (
    select kp.channel_link, kp.air_link, kp.cast_net, kp.pay_date, kp.brand, kp.paid,
           nullif(substring(kp.air_link from 'video/([0-9]+)'), '') as vid
    from koc_payments kp
    where kp.staff is not null and trim(kp.staff) = trim(p_staff)
  ),
  vid_date as (select id::text as vid, max(post_date) as post_date from tiktok_shop_videos where post_date is not null group by id::text),
  air_date as (select id_video::text as vid, max(ngay_air) as ngay_air from air_links where ngay_air is not null and ngay_air <= date '2026-12-31' group by id_video::text)
  select p.channel_link, p.air_link, p.cast_net,
         coalesce(vd.post_date, ad.ngay_air) as air_date, p.pay_date, p.brand, p.paid
  from pay p
  left join vid_date vd on vd.vid = p.vid
  left join air_date ad on ad.vid = p.vid
  where coalesce(vd.post_date, ad.ngay_air) is not null
    and coalesce(vd.post_date, ad.ngay_air) >= p_from and coalesce(vd.post_date, ad.ngay_air) <= p_to
  order by air_date desc;
$function$;
grant execute on function public.booking_cast_detail(text,date,date) to anon, authenticated;

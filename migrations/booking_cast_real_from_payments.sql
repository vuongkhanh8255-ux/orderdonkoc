-- MODULE 7 — Ngân sách chi phí booking. Nguồn cast THẬT từ file Thanh toán KOC (koc_payments),
-- quy về THÁNG VIDEO AIR (ngày đăng video). Thay nguồn cũ (generate_air_links_report = cast điền tay
-- vào air_links, ~98% bỏ trống). Dùng CHUNG cho bảng Định Mức ở Dashboard Booking + Module 7.
-- Ngày air: tiktok_shop_videos.post_date (CHÍNH) -> fallback air_links.ngay_air (lọc rác > 2026-12-31).
-- Tách video id từ koc_payments.air_link regex video/([0-9]+). cast_net (chưa thuế). Gom theo staff (tên).
-- TỐI ƯU: chỉ tra đúng ~1000 video có trong koc_payments (LATERAL + index), KHÔNG pre-aggregate cả
--   80k air_links + 98k videos (bản đầu bị statement timeout). id/id_video đều TEXT nên join thẳng dùng index.
-- Đã apply lên DB 2026-06-20.

create index if not exists idx_air_links_id_video on air_links (id_video);

-- 1) Cast thật theo (nhân sự × tháng-air) trong khoảng [p_from, p_to]
create or replace function public.booking_cast_by_month(p_from date, p_to date)
returns table(staff text, air_month text, cast_net numeric, total numeric, orders bigint)
language sql stable security definer set search_path to 'public' set statement_timeout to '30s'
as $function$
  with pay as (
    select trim(kp.staff) as staff, kp.cast_net, kp.total,
           nullif(substring(kp.air_link from 'video/([0-9]+)'), '') as vid
    from koc_payments kp
    where kp.staff is not null and trim(kp.staff) <> ''
  ),
  res as (
    select p.staff, p.cast_net, p.total,
           coalesce(vd.post_date, ad.ngay_air) as air_dt
    from pay p
    left join lateral (select max(post_date) as post_date from tiktok_shop_videos where id = p.vid) vd on true
    left join lateral (select max(ngay_air)  as ngay_air  from air_links where id_video = p.vid and ngay_air is not null and ngay_air <= date '2026-12-31') ad on true
  )
  select staff, to_char(date_trunc('month', air_dt), 'YYYY-MM') as air_month,
         sum(coalesce(cast_net,0))::numeric, sum(coalesce(total,0))::numeric, count(*)::bigint
  from res
  where air_dt is not null and air_dt >= p_from and air_dt <= p_to
  group by staff, date_trunc('month', air_dt)
  order by 2, 1;
$function$;

-- 2) Đơn KHÔNG suy ra được ngày air (để qua Module 5 đối chiếu). Lọc theo pay_date.
create or replace function public.booking_cast_unresolved(p_from date, p_to date)
returns table(id uuid, staff text, brand text, channel_link text, air_link text, cast_net numeric, pay_date date, reason text)
language sql stable security definer set search_path to 'public' set statement_timeout to '30s'
as $function$
  with pay as (
    select kp.id, kp.staff, kp.brand, kp.channel_link, kp.air_link, kp.cast_net, kp.pay_date,
           nullif(substring(kp.air_link from 'video/([0-9]+)'), '') as vid
    from koc_payments kp
    where coalesce(kp.cast_net,0) > 0 and kp.pay_date >= p_from and kp.pay_date <= p_to
  )
  select p.id, p.staff, p.brand, p.channel_link, p.air_link, p.cast_net, p.pay_date,
         case when coalesce(p.air_link,'') = '' then 'Thiếu link air'
              when p.vid is null then 'Link air không phải link video'
              else 'Video chưa có ngày đăng (chưa đồng bộ)' end as reason
  from pay p
  left join lateral (select max(post_date) as post_date from tiktok_shop_videos where id = p.vid) vd on true
  left join lateral (select max(ngay_air)  as ngay_air  from air_links where id_video = p.vid and ngay_air is not null and ngay_air <= date '2026-12-31') ad on true
  where coalesce(vd.post_date, ad.ngay_air) is null
  order by p.pay_date desc;
$function$;

grant execute on function public.booking_cast_by_month(date,date) to anon, authenticated;
grant execute on function public.booking_cast_unresolved(date,date) to anon, authenticated;

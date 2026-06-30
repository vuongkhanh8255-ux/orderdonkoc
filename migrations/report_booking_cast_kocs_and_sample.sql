-- Bổ sung cho Báo cáo tổng quan (ReportTab): (1) DANH SÁCH KOC đã book cast theo brand, (2) CHI PHÍ GỬI MẪU.
-- Đi kèm report_booking_cast.sql (cast tổng theo brand).

-- (1) Danh sách KOC đã book cast theo brand (ngày air). KOC = @handle tách từ channel_link. Gộp eHerb/Healmi/Moaw.
create or replace function public.report_booking_cast_kocs(p_from date, p_to date)
returns table(brand_canon text, koc text, full_name text, cast_net numeric, n bigint)
language sql stable security definer set search_path to 'public' set statement_timeout to '30s'
as $function$
  with pay as (
    select kp.brand, kp.cast_net, kp.air_date_manual, kp.pay_date, kp.full_name,
           lower(coalesce(substring(kp.channel_link from '@([^/?#]+)'), kp.channel_link)) as koc,
           nullif(substring(kp.air_link from 'video/([0-9]+)'), '') as vid
    from koc_payments kp where coalesce(kp.cast_net,0) <> 0
  ),
  res as (
    select case
        when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
        when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
        when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
        else upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g'))
      end as brand_canon, p.koc, p.full_name, p.cast_net,
      coalesce(p.air_date_manual, vd.post_date, p.pay_date) as air_dt
    from pay p left join lateral (select max(post_date) as post_date from tiktok_shop_videos where id = p.vid) vd on true
  )
  select brand_canon, koc, max(full_name), sum(cast_net)::numeric, count(*)::bigint
  from res where air_dt is not null and air_dt >= p_from and air_dt <= p_to and coalesce(koc,'')<>''
  group by brand_canon, koc order by sum(cast_net) desc;
$function$;
grant execute on function public.report_booking_cast_kocs(date,date) to anon, authenticated;

-- (2) Chi phí gửi mẫu theo brand_ids (khớp Module 1: cost cột AMIS V2 ×1.08×SL +5k +ship; chỉ đơn 'Đã đóng đơn').
create or replace function public.report_sample_cost(p_brand_ids uuid[], p_from date, p_to date)
returns numeric language sql stable security definer set search_path to 'public' set statement_timeout to '30s'
as $function$
  with latest_col as (
    select h as col from costing_data, jsonb_array_elements_text(headers) h where h like 'COSTING T% AMIS V2'
    order by (regexp_match(h,'T(\d+)\.(\d+) AMIS V2'))[2]::int desc,(regexp_match(h,'T(\d+)\.(\d+) AMIS V2'))[1]::int desc limit 1),
  cost_map as (
    select regexp_replace(r->>'Mã','\s','','g') barcode,
      case when trim(replace((r->>lc.col),',',''))~'^[0-9]+(\.[0-9]+)?$' then trim(replace((r->>lc.col),',',''))::numeric else null end cost
    from costing_data cd, latest_col lc, jsonb_array_elements(cd.rows) r where cd.key='latest'),
  per_order as (
    select d.id, d.loai_ship, sum(coalesce(cm.cost,0)*1.08*coalesce(ct.so_luong,0)) items_cost
    from donguis d join chitiettonguis ct on ct.dongui_id=d.id join sanphams sp on sp.id=ct.sanpham_id
    left join cost_map cm on cm.barcode = regexp_replace(coalesce(sp.barcode,''),'\s','','g')
    where sp.brand_id = any(p_brand_ids) and d.trang_thai = 'Đã đóng đơn'
      and (d.ngay_gui at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
    group by d.id, d.loai_ship)
  select coalesce(sum(items_cost + 5000 + case when loai_ship='Hỏa tốc' then 50000 else 20000 end),0)::numeric from per_order;
$function$;
grant execute on function public.report_sample_cost(uuid[],date,date) to anon, authenticated;

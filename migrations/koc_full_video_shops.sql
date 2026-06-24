-- Gian "đếm video FULL": bỏ lọc view≥100/đơn/gmv → Hiệu suất KOC ghi nhận ĐÚNG số như TikTok.
-- Thêm gian = INSERT shop_id vào koc_full_video_shops (hiển thị) + thêm vào VIDEO_FULL_SHOPS trong
-- api/tiktok-shop/analytics.js (sync giữ tất cả video). Dữ liệu đầy đủ nạp 1 lần từ Excel
-- (upsert_shop_videos_max); sync giữ tươi phần cào được.

create table if not exists public.koc_full_video_shops (
  shop_id text primary key,
  note text,
  added_at timestamptz default now()
);
insert into public.koc_full_video_shops(shop_id, note)
values ('7495107349171898427','Bodymiss — đếm full video') on conflict do nothing;
grant select on public.koc_full_video_shops to anon, authenticated;

-- Bản 6 tham số (app dùng). Gian thuộc koc_full_video_shops → vtotal_all/vperiod_all đếm TẤT CẢ video.
drop function if exists public.koc_perf_extra_totals(text, date, date, date, date);  -- dọn bản 5 tham số cũ
create or replace function public.koc_perf_extra_totals(p_shop_id text, p_start date, p_end date, p_cast_start date, p_cast_end date, p_brand text default null::text)
returns table(vtotal bigint, vperiod bigint, cast_total numeric, sample_total numeric, vtotal_all bigint, vperiod_all bigint)
language sql stable set statement_timeout to '40s'
as $function$
  with ff as (
    select (p_shop_id is not null and exists(select 1 from koc_full_video_shops f where f.shop_id = p_shop_id)) as full_on
  ),
  o as (
    select distinct lower(regexp_replace(creator_username, '^@', '')) as uname
    from tiktok_affiliate_orders
    where (p_shop_id is null or shop_id = p_shop_id)
      and (p_start is null or order_date >= p_start)
      and (p_end   is null or order_date <= p_end)
      and creator_username is not null and creator_username <> ''
  ),
  samp as (select coalesce(sum(s.sample_cost),0)::numeric sample_total from o join koc_sample_cost(p_cast_start, p_cast_end, p_brand) s on s.uname = o.uname),
  cst  as (select coalesce(sum(cast_total),0)::numeric cast_total from koc_cast_by_creator(p_shop_id, p_cast_start, p_cast_end)),
  allv as (
    select
      count(*) filter (where (select full_on from ff) or views >= 100 or coalesce(sku_orders,0) > 0 or coalesce(gmv,0) > 0)::bigint as vtotal_all,
      count(*) filter (
        where post_date is not null
          and (p_start is null or post_date >= p_start)
          and (p_end   is null or post_date <= p_end)
          and ((select full_on from ff) or views >= 100 or coalesce(sku_orders,0) > 0 or coalesce(gmv,0) > 0)
      )::bigint as vperiod_all
    from tiktok_shop_videos
    where (p_shop_id is null or shop_id = p_shop_id)
  )
  select allv.vtotal_all, allv.vperiod_all, cst.cast_total, samp.sample_total, allv.vtotal_all, allv.vperiod_all
  from allv, samp, cst;
$function$;
grant execute on function public.koc_perf_extra_totals(text,date,date,date,date,text) to anon, authenticated;

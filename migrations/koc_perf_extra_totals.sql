-- FIX TRUNCATION (Hiệu suất KOC): các tổng vtotal/vperiod/cast/sample TRƯỚC ĐÂY app cộng từ mảng
-- creators (koc_order_stats) — mà PostgREST cắt mảng đó còn ~1000 dòng → shop lớn (EHERB 8159 creator)
-- bị THIẾU ~31% (clip) / ~49% (chi phí mẫu). Fix: tính SERVER-SIDE 1 hàm scalar (1 dòng, không bị cắt),
-- giống cách đã làm cho TỔNG VIEW (koc_video_views_total). API analytics.js dùng hàm này cho 4 tổng.
-- p_start/p_end = kỳ video; p_cast_start/p_cast_end = kỳ cast & chi phí mẫu (chế độ "Tất cả" → null).
-- Đã apply lên DB 2026-06-20.
create or replace function public.koc_perf_extra_totals(p_shop_id text, p_start date, p_end date, p_cast_start date, p_cast_end date)
returns table(vtotal bigint, vperiod bigint, cast_total numeric, sample_total numeric)
language sql stable set statement_timeout to '40s'
as $function$
  with o as (
    select distinct lower(regexp_replace(creator_username, '^@', '')) as uname
    from tiktok_affiliate_orders
    where (p_shop_id is null or shop_id = p_shop_id)
      and (p_start is null or order_date >= p_start)
      and (p_end   is null or order_date <= p_end)
      and creator_username is not null and creator_username <> ''
  ),
  vid_ord as (
    select lower(regexp_replace(creator_username, '^@', '')) as uname, content_id, min(order_date) as post_eff
    from tiktok_affiliate_orders
    where (p_shop_id is null or shop_id = p_shop_id)
      and content_type = 'VIDEO' and coalesce(content_id,'') <> ''
      and creator_username is not null and creator_username <> ''
    group by 1, 2
  ),
  vid_tab as (
    select lower(regexp_replace(username, '^@', '')) as uname, id as content_id, post_date as post_eff
    from tiktok_shop_videos
    where (p_shop_id is null or shop_id = p_shop_id) and coalesce(username,'') <> ''
  ),
  vid as (select uname, content_id, min(post_eff) as post_eff from (select * from vid_ord union all select * from vid_tab) z group by uname, content_id),
  v as (
    select uname, count(*) as vt,
      count(*) filter (where post_eff is not null and (p_start is null or post_eff >= p_start) and (p_end is null or post_eff <= p_end)) as vp
    from vid group by uname
  ),
  vc   as (select coalesce(sum(v.vt),0)::bigint vtotal, coalesce(sum(v.vp),0)::bigint vperiod from o join v on v.uname = o.uname),
  samp as (select coalesce(sum(s.sample_cost),0)::numeric sample_total from o join koc_sample_cost(p_cast_start, p_cast_end) s on s.uname = o.uname),
  cst  as (select coalesce(sum(cast_total),0)::numeric cast_total from koc_cast_by_creator(p_shop_id, p_cast_start, p_cast_end))
  select vc.vtotal, vc.vperiod, cst.cast_total, samp.sample_total from vc, samp, cst;
$function$;
grant execute on function public.koc_perf_extra_totals(text,date,date,date,date) to anon, authenticated;

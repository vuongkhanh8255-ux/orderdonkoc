-- AUDIT 25/6/2026 (Khánh quyết): 2 card chi phí trên Hiệu suất KOC trước đây CHỈ tính cost cho
-- KOC/video CÓ ĐƠN → chi phí bị nén nhỏ, ROAS ảo cao. Sửa theo lựa chọn của Khánh:
--   • CAST  = cast của VIDEO ĐĂNG TRONG KỲ (post_date trong kỳ), KỆ có đơn hay không.
--   • CHI PHÍ MẪU = TỔNG mẫu THỰC GỬI trong kỳ (mọi KOC nhận mẫu), không chỉ KOC-có-đơn.
-- KHÔNG đụng logic khác (GMV/hoa hồng giữ nguyên — đã verify đúng).

-- (1) CAST: quy theo username của VIDEO (tiktok_shop_videos.username), tính cho MỌI video đăng trong kỳ
--     có cast (koc_payments theo air_link, hoặc air_links.cast). Bỏ yêu cầu video phải có đơn affiliate.
create or replace function public.koc_cast_by_creator(p_shop_id text, p_start date default null, p_end date default null)
returns table(creator_username text, cast_total numeric)
language sql stable set statement_timeout to '25s'
as $function$
  with vids as (
    select tv.id as content_id, lower(regexp_replace(tv.username,'^@','')) as uname
    from tiktok_shop_videos tv
    where tv.shop_id = p_shop_id
      and (p_start is null or tv.post_date >= p_start)
      and (p_end   is null or tv.post_date <= p_end)
      and coalesce(tv.username,'') <> ''),
  cids as (select distinct content_id from vids),
  pay_cast as (
    select content_id, sum(cast_net / cnt::numeric) as cast_amount
    from (select kp.cast_net, (regexp_matches(kp.air_link, '/video/(\d{6,})', 'g'))[1] as content_id,
            count(*) over (partition by kp.id) as cnt
          from koc_payments kp
          where coalesce(kp.air_link,'') <> '' and coalesce(kp.cast_net,0) > 0) z
    where content_id in (select content_id from cids) group by content_id),
  air_cast as (
    select al.id_video as content_id, max(nullif(al."cast",'')::numeric) as cast_amount
    from air_links al
    where al.id_video in (select content_id from cids)
      and coalesce(nullif(al."cast",'')::numeric, 0) > 0
    group by al.id_video),
  vc as (
    select coalesce(p.content_id, a.content_id) as content_id, coalesce(p.cast_amount, a.cast_amount) as cast_amount
    from pay_cast p full join air_cast a on a.content_id = p.content_id)
  select v.uname as creator_username, sum(vc.cast_amount)::numeric as cast_total
  from vids v join vc on vc.content_id = v.content_id
  where vc.cast_amount is not null
  group by v.uname;
$function$;
grant execute on function public.koc_cast_by_creator(text,date,date) to anon, authenticated;

-- (2) CHI PHÍ MẪU TỔNG = mọi đơn mẫu trong kỳ (bỏ `o join` ràng buộc KOC-có-đơn). cast_total tự cập
--     nhật theo hàm (1). Các tổng video giữ nguyên.
create or replace function public.koc_perf_extra_totals(p_shop_id text, p_start date, p_end date, p_cast_start date, p_cast_end date, p_brand text default null)
returns table(vtotal bigint, vperiod bigint, cast_total numeric, sample_total numeric, vtotal_all bigint, vperiod_all bigint)
language sql stable set statement_timeout to '40s'
as $function$
  with ff as (
    select (p_shop_id is not null and exists(select 1 from koc_full_video_shops f where f.shop_id = p_shop_id)) as full_on
  ),
  samp as (select coalesce(sum(s.sample_cost),0)::numeric sample_total from koc_sample_cost(p_cast_start, p_cast_end, p_brand) s),
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

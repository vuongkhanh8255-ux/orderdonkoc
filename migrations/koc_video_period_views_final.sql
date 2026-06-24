-- View KOC = view PHÁT SINH trong các THÁNG của kỳ chọn (delta từng tháng, KHÔNG cộng dồn quá khứ).
--   VD: T4 video 1tr view, T5 thêm 500k → chọn T5 hiện 500k (không phải 1tr5). Chọn "Tất cả" = cộng delta mọi tháng.
--   Bảng tiktok_video_monthly_views lưu đúng delta từng tháng (đã verify không trùng).
-- Gian thuộc koc_full_video_shops: tính cho TẤT CẢ video của kênh (theo username), không chỉ video có đơn.
-- (Đã từng thử: card dùng cột tiktok_shop_videos.views = undercount; lũy kế ym<=p_end = cộng dồn quá khứ — CẢ HAI SAI, đã bỏ.)

-- Per-KOC
create or replace function public.koc_video_views(p_shop_id text, p_start date, p_end date)
returns table(uname text, total_views bigint) language sql stable as $function$
  with ff as (select (p_shop_id is not null and exists(select 1 from koc_full_video_shops f where f.shop_id=p_shop_id)) as full_on),
  months as (
    select to_char(gs,'YYYY-MM') ym
    from generate_series(date_trunc('month',coalesce(p_start,date '2026-01-01')),
                         date_trunc('month',coalesce(p_end,current_date)), interval '1 month') gs
  ),
  full_v as (   -- gian full: tất cả video của kênh theo username
    select lower(regexp_replace(v.username,'^@','')) as uname, coalesce(sum(mv.views),0)::bigint as total_views
    from tiktok_shop_videos v
    join tiktok_video_monthly_views mv on mv.id = v.id and mv.ym in (select ym from months)
    where v.shop_id = p_shop_id and coalesce(v.username,'') <> ''
    group by 1
  ),
  norm_vids as (   -- gian khác: chỉ video có đơn trong kỳ
    select distinct o.creator_username, o.content_id
    from tiktok_affiliate_orders o
    where o.content_type='VIDEO' and coalesce(o.content_id,'')<>'' and o.creator_username is not null and o.creator_username<>''
      and (p_shop_id is null or o.shop_id=p_shop_id)
      and (p_start is null or o.order_date>=p_start) and (p_end is null or o.order_date<=p_end)
  ),
  norm_v as (
    select lower(regexp_replace(v.creator_username,'^@','')) as uname, coalesce(sum(mv.views),0)::bigint as total_views
    from norm_vids v join tiktok_video_monthly_views mv on mv.id=v.content_id and mv.ym in (select ym from months)
    group by 1
  )
  select uname, total_views from full_v where (select full_on from ff)
  union all
  select uname, total_views from norm_v where not (select full_on from ff);
$function$;
grant execute on function public.koc_video_views(text,date,date) to anon, authenticated;

-- Card "Tổng view" (toàn shop, view-tháng theo kỳ)
create or replace function public.koc_video_views_total(p_shop_id text, p_start date, p_end date)
returns bigint language sql stable set statement_timeout to '20s'
as $function$
  with months as (
    select to_char(gs,'YYYY-MM') ym
    from generate_series(date_trunc('month', coalesce(p_start, date '2026-01-01')),
                         date_trunc('month', coalesce(p_end, current_date)), interval '1 month') gs
  )
  select coalesce(sum(views),0)::bigint
  from tiktok_video_monthly_views
  where (p_shop_id is null or shop_id = p_shop_id) and ym in (select ym from months);
$function$;
grant execute on function public.koc_video_views_total(text,date,date) to anon, authenticated;

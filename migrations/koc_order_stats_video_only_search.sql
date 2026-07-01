-- Search Hiệu suất KOC: ra cả KOC CHỈ-CÓ-VIDEO (0 đơn).
-- Trước đây final select `from o left join v` → ai không có đơn (o) thì bị loại sạch dù clip có sẵn.
-- Sửa: UNION thêm nhánh KOC chỉ-có-video, CHỈ kích hoạt khi p_search != null (tab chính + sync KHÔNG đổi).
CREATE OR REPLACE FUNCTION public.koc_order_stats(p_shop_id text, p_start date, p_end date, p_search text DEFAULT NULL::text)
 RETURNS TABLE(creator_username text, orders bigint, gmv numeric, qty bigint, commission numeric, videos bigint, lives bigint, products bigint, last_order bigint, vtotal bigint, vperiod bigint)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '20s'
AS $function$
  with o as (
    select creator_username,
      count(distinct order_id) as orders,
      coalesce(sum(price_amount * quantity), 0) as gmv,
      coalesce(sum(quantity), 0) as qty,
      coalesce(sum(est_commission), 0) as commission,
      count(distinct content_id) filter (where content_type = 'VIDEO' and content_id <> '') as videos,
      count(distinct content_id) filter (where content_type = 'LIVE'  and content_id <> '') as lives,
      count(distinct product_id) filter (where product_id <> '') as products,
      max(create_time) as last_order
    from tiktok_affiliate_orders
    where (p_shop_id is null or shop_id = p_shop_id)
      and (p_start is null or order_date >= p_start)
      and (p_end   is null or order_date <= p_end)
      and creator_username is not null and creator_username <> ''
      and (p_search is null or creator_username ilike '%'||p_search||'%')
    group by creator_username
  ),
  vid_ord as (
    select lower(regexp_replace(creator_username, '^@', '')) as uname,
           content_id, min(order_date) as post_eff
    from tiktok_affiliate_orders
    where (p_shop_id is null or shop_id = p_shop_id)
      and content_type = 'VIDEO' and coalesce(content_id,'') <> ''
      and creator_username is not null and creator_username <> ''
      and (p_search is null or creator_username ilike '%'||p_search||'%')
    group by 1, 2
  ),
  vid_tab as (
    select lower(regexp_replace(username, '^@', '')) as uname,
           id as content_id, post_date as post_eff
    from tiktok_shop_videos
    where (p_shop_id is null or shop_id = p_shop_id) and coalesce(username,'') <> ''
      and (p_search is null or username ilike '%'||p_search||'%')
  ),
  vid as (
    select uname, content_id, min(post_eff) as post_eff
    from (select * from vid_ord union all select * from vid_tab) z
    group by uname, content_id
  ),
  v as (
    select uname,
      count(*) as vtotal,
      count(*) filter (where post_eff is not null
        and (p_start is null or post_eff >= p_start)
        and (p_end   is null or post_eff <= p_end)) as vperiod
    from vid
    group by uname
  ),
  vdisp as (
    select lower(regexp_replace(username, '^@', '')) as uname, max(username) as disp
    from tiktok_shop_videos
    where (p_shop_id is null or shop_id = p_shop_id) and coalesce(username,'') <> ''
      and (p_search is null or username ilike '%'||p_search||'%')
    group by 1
  )
  -- (1) KOC có đơn — giữ nguyên
  select o.creator_username, o.orders, o.gmv, o.qty, o.commission, o.videos, o.lives, o.products, o.last_order,
    coalesce(v.vtotal, 0)  as vtotal,
    coalesce(v.vperiod, 0) as vperiod
  from o left join v on v.uname = lower(regexp_replace(o.creator_username, '^@', ''))
  union all
  -- (2) KOC CHỈ có video (0 đơn) — chỉ thêm khi đang SEARCH
  select vd.disp, 0::bigint, 0::numeric, 0::bigint, 0::numeric,
    0::bigint, 0::bigint, 0::bigint, 0::bigint,
    coalesce(v.vtotal, 0), coalesce(v.vperiod, 0)
  from v
  join vdisp vd on vd.uname = v.uname
  where p_search is not null
    and not exists (select 1 from o where lower(regexp_replace(o.creator_username, '^@', '')) = v.uname)
  order by 3 desc, 11 desc;
$function$;

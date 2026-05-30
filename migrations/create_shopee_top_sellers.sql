-- Best-selling products per shop, computed from synced Shopee orders (shopee_orders.items).
-- Used by GET /api/shopee/top-picks?action=top_sellers (Dashboard Ecom → "Top sản phẩm bán chạy").
-- Read-only, SECURITY INVOKER (respects RLS; backend calls it with the service-role key).
--
-- Note: shopee_orders.items is stored as a JSON *string* inside a jsonb column
-- (double-encoded by the order sync), so we unwrap it with (items #>> '{}')::jsonb.

create or replace function public.shopee_top_sellers(
  p_days   int  default 30,
  p_limit  int  default 10,
  p_shop_id text default null
)
returns table (
  shop_id    text,
  shop_name  text,
  item_id    text,
  item_name  text,
  total_qty  numeric,
  revenue    numeric,
  rnk        bigint
)
language sql
stable
as $$
  with src as (
    select o.shop_id, o.shop_name, (o.items #>> '{}')::jsonb as arr
    from public.shopee_orders o
    where o.items is not null
      and jsonb_typeof(o.items) = 'string'
      and o.create_time >= extract(epoch from now())::bigint - greatest(p_days,1) * 86400
      and coalesce(o.order_status,'') not in ('CANCELLED','IN_CANCEL')
      and (p_shop_id is null or o.shop_id = p_shop_id)
  ),
  itm as (
    select s.shop_id, s.shop_name,
      (it->>'item_id')   as item_id,
      (it->>'item_name') as item_name,
      coalesce(nullif(it->>'qty','')::numeric, 0) as qty,
      coalesce(nullif(it->>'qty','')::numeric, 0) * coalesce(nullif(it->>'price','')::numeric, 0) as rev
    from src s, lateral jsonb_array_elements(s.arr) as it
  ),
  agg as (
    select shop_id, max(shop_name) as shop_name, item_id,
      max(item_name) as item_name, sum(qty) as total_qty, sum(rev) as revenue
    from itm
    where item_id is not null
    group by shop_id, item_id
  ),
  ranked as (
    select agg.*, row_number() over (partition by shop_id order by total_qty desc, revenue desc) as rnk
    from agg
  )
  select ranked.shop_id, ranked.shop_name, ranked.item_id, ranked.item_name,
         ranked.total_qty, ranked.revenue, ranked.rnk
  from ranked
  where ranked.rnk <= greatest(p_limit,1)
  order by ranked.shop_id, ranked.rnk;
$$;

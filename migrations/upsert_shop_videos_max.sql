-- Upsert video TikTok kiểu GREATEST: chỉ nâng số liệu lên, không bao giờ hạ xuống.
-- Dùng cho nạp Excel "Video Performance List" làm bản gốc + sync hằng ngày không đè số thấp.
create or replace function public.upsert_shop_videos_max(p_rows jsonb)
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare n integer;
begin
  insert into tiktok_shop_videos as t
    (id, shop_id, username, title, views, gmv, units_sold, sku_orders, ctr, video_post_time, post_date, product_id, product_name, product_count, synced_at)
  select x.id, x.shop_id, nullif(x.username,''), nullif(x.title,''), x.views, x.gmv, x.units_sold, x.sku_orders, x.ctr,
         nullif(x.video_post_time,''), x.post_date, nullif(x.product_id,''), nullif(x.product_name,''), x.product_count, now()
  from jsonb_to_recordset(p_rows) as x(
    id text, shop_id text, username text, title text, views bigint, gmv numeric, units_sold bigint,
    sku_orders bigint, ctr numeric, video_post_time text, post_date date, product_id text, product_name text, product_count integer)
  where x.id is not null and x.id <> ''
  on conflict (id) do update set
    views      = greatest(coalesce(t.views,0),      coalesce(excluded.views,0)),
    gmv        = greatest(coalesce(t.gmv,0),        coalesce(excluded.gmv,0)),
    units_sold = greatest(coalesce(t.units_sold,0), coalesce(excluded.units_sold,0)),
    sku_orders = greatest(coalesce(t.sku_orders,0), coalesce(excluded.sku_orders,0)),
    ctr        = coalesce(excluded.ctr, t.ctr),
    shop_id    = coalesce(t.shop_id, excluded.shop_id),
    username   = coalesce(excluded.username, t.username),
    title      = coalesce(excluded.title, t.title),
    video_post_time = coalesce(excluded.video_post_time, t.video_post_time),
    post_date  = coalesce(excluded.post_date, t.post_date),
    product_id = coalesce(excluded.product_id, t.product_id),
    product_name = coalesce(excluded.product_name, t.product_name),
    product_count = coalesce(excluded.product_count, t.product_count),
    synced_at  = now();
  get diagnostics n = row_count;
  return n;
end $function$;

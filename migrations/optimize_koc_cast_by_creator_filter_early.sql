-- Tối ưu koc_cast_by_creator (Hiệu suất KOC) — shop to (eHerb) cold build TIMEOUT >90s.
-- Nguyên nhân: view v_video_cast tính cast cho TẤT CẢ video (air_per_vid cast ::numeric từng dòng
--   trong ~80k air_links) rồi koc_cast_by_creator mới join lọc ~vài trăm content_id của shop → 39-72s.
-- Fix: lọc air_links/koc_payments theo content_id của shop (cids) TRƯỚC (dùng index id_video lấy đúng
--   vài trăm dòng) rồi mới cast ::numeric → 11.5s; full build eHerb 23.5s. Áp dụng cho mọi shop.
-- Đã apply lên DB 2026-06-22. (Không sửa code endpoint — chỉ đổi hàm DB.)
drop index if exists public.idx_air_links_cast_set;

create or replace function public.koc_cast_by_creator(p_shop_id text, p_start date default null, p_end date default null)
returns table(creator_username text, cast_total numeric)
language sql stable set statement_timeout to '25s'
as $function$
  with vids as (
    select tv.id as content_id from tiktok_shop_videos tv
    where tv.shop_id = p_shop_id
      and (p_start is null or tv.post_date >= p_start)
      and (p_end is null or tv.post_date <= p_end)),
  creator_of as (
    select distinct o.creator_username, o.content_id
    from tiktok_affiliate_orders o join vids on vids.content_id = o.content_id
    where o.shop_id = p_shop_id and coalesce(o.content_id,'') <> ''),
  cids as (select distinct content_id from creator_of),
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
  select co.creator_username, sum(vc.cast_amount)::numeric as cast_total
  from creator_of co join vc on vc.content_id = co.content_id
  where vc.cast_amount is not null
  group by co.creator_username;
$function$;

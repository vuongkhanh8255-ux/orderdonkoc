-- Module 8: pool KOC + brand ĐÃ LÀM (đối chiếu đơn affiliate + video theo shop). brands_done rỗng = CHƯA LÀM.
-- Trả thêm open_id (để mời qua API affiliate) + moi_im_at/moi_collab_at (trạng thái đã mời).
drop function if exists public.koc_hunt_list(boolean,integer,integer);
create function public.koc_hunt_list(p_only_new boolean default false, p_limit int default 500, p_offset int default 0)
 returns table(username text, nickname text, avatar text, followers bigint, avg_views bigint,
   gmv_tier text, region text, categories jsonb, da_lien_he boolean, lien_he_boi text, ghi_chu text,
   updated_at timestamptz, brands_done text[],
   open_id text, moi_im_at timestamptz, moi_collab_at timestamptz)
 language sql stable security definer set search_path to 'public' set statement_timeout to '30s'
as $function$
  with shop_brand(shop_id, brand) as (values
    ('7495107349171898427','Body Miss'), ('7494529979361168222','eHerb'), ('7495838925500090511','eHerb HCM'),
    ('7494813818973817115','Milaganics'), ('7495831977917385095','Moaw'),
    ('7494251668499498533','Healmii'), ('7496180170889726491','Real Steel')),
  pool_users as (select username from koc_marketplace_pool),
  done_ord as (select distinct lower(regexp_replace(o.creator_username,'^@','')) as uname, sb.brand
    from tiktok_affiliate_orders o join shop_brand sb on sb.shop_id=o.shop_id
    where lower(regexp_replace(o.creator_username,'^@','')) in (select username from pool_users)),
  done_vid as (select distinct lower(regexp_replace(coalesce(v.username,''),'^@','')) as uname, sb.brand
    from tiktok_shop_videos v join shop_brand sb on sb.shop_id=v.shop_id
    where lower(regexp_replace(coalesce(v.username,''),'^@','')) in (select username from pool_users)),
  done as (select uname, array_agg(distinct brand order by brand) as brands
    from (select * from done_ord union select * from done_vid) z group by uname)
  select p.username, p.nickname, p.avatar, p.followers, p.avg_views, p.gmv_tier, p.region, p.categories,
    p.da_lien_he, p.lien_he_boi, p.ghi_chu, p.updated_at, coalesce(d.brands,'{}') as brands_done,
    p.open_id, p.moi_im_at, p.moi_collab_at
  from koc_marketplace_pool p left join done d on d.uname=p.username
  where (not p_only_new or d.uname is null)
  order by p.followers desc nulls last limit p_limit offset p_offset;
$function$;

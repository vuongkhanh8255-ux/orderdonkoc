-- Săn KOC Body Miss: creator đăng video bán hàng gần đây (từ tiktok_shop_videos, không gọi API)
-- + bảng koc_scout_marks để đội lượm KOC (quan tâm/đã liên hệ/bỏ qua) + ghi chú.
create table if not exists public.koc_scout_marks (
  username text primary key, brand text default 'BODYMISS',
  status text default 'lum', marked_by text, note text, updated_at timestamptz default now()
);
alter table public.koc_scout_marks enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='koc_scout_marks' and policyname='koc_scout_all') then
    create policy koc_scout_all on public.koc_scout_marks for all using (true) with check (true);
  end if;
end $$;

drop function if exists public.bodymiss_scout(integer,boolean,boolean,bigint,integer);
create function public.bodymiss_scout(
  p_days int default 7, p_only_unmanaged boolean default true, p_only_new boolean default false,
  p_min_views bigint default 0, p_limit int default 500)
 returns table(username text, n_videos int, total_views bigint, total_gmv numeric, total_orders bigint,
   last_post date, first_post date, is_new_creator boolean, da_quan_ly boolean, staff_name text,
   in_pool boolean, avatar text, followers bigint, email text, sdt text, top_title text,
   mark_status text, mark_note text, marked_by text)
 language sql stable security definer set search_path to 'public' set statement_timeout to '30s'
as $function$
  with vids as (
    select lower(regexp_replace(username,'^@','')) as uname, views, gmv, sku_orders, post_date, title
    from tiktok_shop_videos where shop_id='7495107349171898427' and coalesce(username,'')<>''),
  firsts as (select uname, min(post_date) as first_post from vids group by uname),
  recent as (
    select uname, count(*)::int as n_videos, sum(coalesce(views,0)) as total_views,
      sum(coalesce(gmv,0)) as total_gmv, sum(coalesce(sku_orders,0)) as total_orders,
      max(post_date) as last_post, (array_agg(title order by coalesce(views,0) desc))[1] as top_title
    from vids where post_date >= current_date - p_days group by uname),
  assigned as (select lower(koc_id) as uname, staff_name from koc_brand_assignments where brand_name='BODYMISS' and coalesce(staff_name,'')<>''),
  bl as (select lower(regexp_replace(id_kenh,'^@','')) as uname from koc_blacklist)
  select r.uname, r.n_videos, r.total_views, r.total_gmv, r.total_orders, r.last_post,
    f.first_post, (f.first_post >= current_date - p_days) as is_new_creator,
    (a.uname is not null) as da_quan_ly, a.staff_name, (p.username is not null) as in_pool,
    p.avatar, p.followers, p.email, p.sdt, r.top_title, m.status, m.note, m.marked_by
  from recent r join firsts f on f.uname=r.uname
  left join assigned a on a.uname=r.uname
  left join koc_marketplace_pool p on p.username=r.uname
  left join koc_scout_marks m on m.username=r.uname
  where r.total_views >= p_min_views and not exists (select 1 from bl where bl.uname=r.uname)
    and (not p_only_unmanaged or a.uname is null) and (not p_only_new or f.first_post >= current_date - p_days)
  order by r.total_views desc nulls last limit p_limit;
$function$;

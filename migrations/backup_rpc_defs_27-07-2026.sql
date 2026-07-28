-- SNAPSHOT toan bo RPC (public functions) tu Supabase daily backup 26/7/2026 21:14 UTC (= 4h14 sang 27/7 VN)
-- Luu lam bao hiem truoc khi xoa project tam khoi-phuc-tag-tam (vu dieu tra mat tag 28/7).
-- KHONG chay truc tiep ca file — chi de tra cuu/khoi phuc tung ham khi can.

-- ===== auto_remove_overdue_assignments =====
CREATE OR REPLACE FUNCTION public.auto_remove_overdue_assignments(p_dry boolean DEFAULT false)
 RETURNS TABLE(koc_id text, brand_name text, staff_name text, days_over integer, limit_days integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
 SET work_mem TO '256MB'
AS $function$
#variable_conflict use_column
begin
  if not p_dry and not coalesce((select enabled from app_flags where flag = 'auto_remove_overdue'), true) then
    return;
  end if;
  create temp table _rm on commit drop as
  with a as (
    select a.koc_id, lower(regexp_replace(a.koc_id,'^@','')) as un, a.brand_name, a.staff_name,
           coalesce(a.approved_at, a.assigned_at)::date as since_date, a.last_order_at, cbs.shop_id
    from koc_brand_assignments a join cast_brand_shop cbs on upper(trim(cbs.brand)) = upper(trim(a.brand_name))
    where a.status = 'approved'),
  sc as (select distinct shop_id from a),
  un as (select distinct un u from a),
  vid_air as (
    select o.shop_id, lower(regexp_replace(o.creator_username,'^@','')) uname, o.content_id vid,
           min(o.order_date)::date post_d
      from tiktok_affiliate_orders o
     where o.content_type='VIDEO' and coalesce(o.content_id,'')<>''
       and o.shop_id in (select shop_id from sc)
       and lower(regexp_replace(o.creator_username,'^@','')) in (select u from un)
     group by 1,2,3),
  air_src as (
    select shop_id, uname, max(post_d) last_air from vid_air group by 1,2
    union all
    select v.shop_id, lower(regexp_replace(coalesce(v.username,''),'^@','')) uname, max(v.post_date) last_air
      from tiktok_shop_videos v where v.shop_id in (select shop_id from sc)
        and lower(regexp_replace(coalesce(v.username,''),'^@','')) in (select u from un) group by 1,2
    union all
    select k.shop_id, lower(regexp_replace(coalesce(k.uname,''),'^@','')) uname, max(k.post_eff::date) last_air
      from koc_video_unit k where k.shop_id in (select shop_id from sc) group by 1,2),
  air_agg as (select shop_id, uname, max(last_air) last_air from air_src group by 1,2),
  agg as (select a.koc_id, a.brand_name, a.staff_name, a.since_date, a.last_order_at, a.un, aa.last_air
    from a left join air_agg aa on aa.shop_id = a.shop_id and aa.uname = a.un),
  f as (select *, (last_order_at is not null and (last_air is null or last_air < last_order_at)) as owes from agg),
  g as (select koc_id, brand_name, staff_name, un,
      case when owes then (current_date - last_order_at)
           else (current_date - coalesce(last_air, since_date)) end as days_over,
      case when owes then 30
           when last_air is null then 45
           when since_date <= last_air then 45
           when (since_date - last_air) > 45 then (since_date - last_air) + 10
           else 50 end as limit_days
    from f),
  cast_kocs as (select distinct lower((regexp_match(channel_link, '@([^/?#]+)'))[1]) as uname
    from koc_payments where channel_link ~ '@' and cast_net is not null and cast_net > 0),
  prio as (select lower(regexp_replace(ktp.koc_id,'^@','')) as uname, upper(trim(ktp.brand_name)) as brand_u
    from koc_tag_priority ktp
    where (ktp.status='approved' and ktp.prioritized_at is not null and ktp.prioritized_at >= now() - interval '10 days') or ktp.status='proposed')
  select g.koc_id, g.brand_name, g.staff_name, g.days_over::int as days_over, g.limit_days::int as limit_days
  from g
  where g.days_over >= g.limit_days
    and g.un not in (select uname from cast_kocs where uname is not null)
    and not exists (select 1 from prio p where p.uname = g.un and p.brand_u = upper(trim(g.brand_name)));

  if not p_dry then
    insert into koc_assignment_history(koc_id, brand_name, staff_name, action, actor, tag_since)
    select r.koc_id, r.brand_name, r.staff_name, 'remove', 'auto (quá hạn)',
      (select coalesce(x.approved_at, x.assigned_at)::date from koc_brand_assignments x
         where lower(regexp_replace(coalesce(x.koc_id,''),'^@','')) = lower(regexp_replace(coalesce(r.koc_id,''),'^@',''))
           and x.brand_name = r.brand_name and x.status='approved' limit 1)
    from _rm r;
    delete from koc_brand_assignments a using _rm r
    where lower(regexp_replace(coalesce(a.koc_id,''),'^@','')) = lower(regexp_replace(coalesce(r.koc_id,''),'^@',''))
      and a.brand_name = r.brand_name and a.status = 'approved';
  end if;
  return query select r.koc_id, r.brand_name, r.staff_name, r.days_over, r.limit_days from _rm r order by r.days_over desc;
end $function$


-- ===== blacklist_aired_staff =====
CREATE OR REPLACE FUNCTION public.blacklist_aired_staff()
 RETURNS TABLE(id_kenh text, staff text, total_air bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with bl as (
    select id_kenh, lower(replace(id_kenh, '@', '')) k
    from koc_blacklist where coalesce(id_kenh, '') <> ''
  ),
  al as (
    select lower(replace(a.id_kenh, '@', '')) k, n.ten_nhansu ns, count(*) cnt
    from air_links a
    join nhansu n on n.id = a.nhansu_id
    where coalesce(a.id_kenh, '') <> '' and a.nhansu_id is not null
      and lower(replace(a.id_kenh, '@', '')) in (select k from bl)
      and not (lower(replace(a.id_kenh, '@', '')) = '.cobedau1512' and n.ten_nhansu = 'Thu Thảo')
      and not (lower(replace(a.id_kenh, '@', '')) = 'taphoaso27'   and n.ten_nhansu = 'Minh Thảo')
    group by 1, 2
  )
  select bl.id_kenh,
    string_agg(al.ns || ' (' || al.cnt || ')', ', ' order by al.cnt desc, al.ns) as staff,
    sum(al.cnt)::bigint as total_air
  from bl join al on al.k = bl.k
  group by bl.id_kenh;
$function$


-- ===== blacklist_ordered_staff =====
CREATE OR REPLACE FUNCTION public.blacklist_ordered_staff()
 RETURNS TABLE(id_kenh text, staff text, total_order bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with bl as (
    select id_kenh, lower(replace(id_kenh, '@', '')) k
    from koc_blacklist where coalesce(id_kenh, '') <> ''
  ),
  od as (
    select lower(replace(d.koc_id_kenh, '@', '')) k, n.ten_nhansu ns, count(*) cnt
    from donguis d
    join nhansu n on n.id = d.nhansu_id
    where coalesce(d.koc_id_kenh, '') <> '' and d.nhansu_id is not null
      and lower(replace(d.koc_id_kenh, '@', '')) in (select k from bl)
    group by 1, 2
  )
  select bl.id_kenh,
    string_agg(od.ns || ' (' || od.cnt || ')', ', ' order by od.cnt desc, od.ns) as staff,
    sum(od.cnt)::bigint as total_order
  from bl join od on od.k = bl.k
  group by bl.id_kenh;
$function$


-- ===== block_incomplete_koc_payment =====
CREATE OR REPLACE FUNCTION public.block_incomplete_koc_payment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare m text := '';
begin
  -- Đơn ĐÃ thanh toán (paid) = đã xong → MIỄN bắt buộc (cho lưu/đồng bộ thoải mái).
  if coalesce(NEW.paid, false) then return NEW; end if;

  if coalesce(nullif(trim(NEW.full_name),''), nullif(trim(NEW.beneficiary),'')) is null then m := m || 'Họ tên, '; end if;
  if nullif(trim(NEW.bank_account),'') is null then m := m || 'STK, '; end if;
  if nullif(trim(NEW.bank_name),'')    is null then m := m || 'Ngân hàng, '; end if;
  if nullif(trim(NEW.air_link),'')     is null then m := m || 'Link air, '; end if;
  if nullif(trim(NEW.cccd),'')         is null then m := m || 'CCCD, '; end if;
  if nullif(trim(NEW.cccd_image),'')   is null then m := m || 'Ảnh CCCD, '; end if;
  if nullif(trim(NEW.contract_link),'') is null then m := m || 'Tin nhắn, '; end if;
  if coalesce(NEW.cast_net,0) >= 2000000 and nullif(trim(NEW.contract_file),'') is null then m := m || 'Hợp đồng, '; end if;

  if m = '' then return NEW; end if;

  if TG_OP = 'INSERT' then
    raise exception 'KOC_PAYMENT_INCOMPLETE|%', rtrim(m, ', ');
  elsif TG_OP = 'UPDATE' and NEW.accountant_approved and not coalesce(OLD.accountant_approved,false) then
    raise exception 'KOC_PAYMENT_INCOMPLETE|%', rtrim(m, ', ');
  end if;
  return NEW;
end $function$


-- ===== block_koc_tag_conflict =====
CREATE OR REPLACE FUNCTION public.block_koc_tag_conflict()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_staff text;
  v_conf  record;
begin
  -- Chỉ kiểm khi ID KÊNH thật sự THAY ĐỔI (sửa) → không cản các update khác (đổi trạng thái, địa chỉ…).
  if NEW.koc_id_kenh is distinct from OLD.koc_id_kenh then
    select ten_nhansu into v_staff from nhansu where id = NEW.nhansu_id;
    -- Có NGƯỜI KHÁC gắn tag approved cho (kênh mới + brand của đơn) ở Hiệu suất KOC?
    select a.staff_name, a.brand_name into v_conf
    from koc_brand_assignments a
    join chitiettonguis ct on ct.dongui_id = NEW.id
    join sanphams sp on sp.id = ct.sanpham_id
    join brands b on b.id = sp.brand_id
    where a.status = 'approved'
      and lower(regexp_replace(trim(a.koc_id), '^@', '')) = lower(regexp_replace(trim(NEW.koc_id_kenh), '^@', ''))
      and regexp_replace(upper(a.brand_name), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(b.ten_brand), '[^A-Z0-9]', '', 'g')
      and lower(trim(coalesce(a.staff_name, ''))) is distinct from lower(trim(coalesce(v_staff, '')))
    limit 1;
    if found then
      raise exception 'KOC_TAG_CONFLICT|%|%|%', trim(NEW.koc_id_kenh), v_conf.staff_name, v_conf.brand_name;
    end if;
  end if;
  return NEW;
end $function$


-- ===== block_zombie_assignment =====
CREATE OR REPLACE FUNCTION public.block_zombie_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if exists (
    select 1 from koc_assignment_history h
    where h.koc_id = NEW.koc_id
      and h.brand_name = NEW.brand_name
      and h.action = 'remove'
      and h.created_at > NEW.assigned_at
  ) then
    return null;   -- bỏ qua insert (zombie chết lặng lẽ, không văng lỗi)
  end if;
  return NEW;
end $function$


-- ===== bodymiss_scout =====
CREATE OR REPLACE FUNCTION public.bodymiss_scout(p_days integer DEFAULT 7, p_only_unmanaged boolean DEFAULT true, p_only_new boolean DEFAULT false, p_min_views bigint DEFAULT 0, p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)
 RETURNS TABLE(username text, n_videos integer, total_views bigint, total_gmv numeric, total_orders bigint, last_post date, first_post date, is_new_creator boolean, da_quan_ly boolean, staff_name text, in_pool boolean, avatar text, followers bigint, email text, sdt text, top_title text, last_video_id text, has_cast boolean, mark_status text, mark_note text, marked_by text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
  with vids as (
    select lower(regexp_replace(username,'^@','')) as uname, id, views, gmv, sku_orders, post_date, title
    from tiktok_shop_videos where shop_id='7495107349171898427' and coalesce(username,'')<>''),
  firsts as (select uname, min(post_date) as first_post from vids group by uname),
  recent as (
    select uname, count(*)::int as n_videos, sum(coalesce(views,0)) as total_views,
      sum(coalesce(gmv,0)) as total_gmv, sum(coalesce(sku_orders,0)) as total_orders, max(post_date) as last_post,
      (array_agg(title order by coalesce(views,0) desc))[1] as top_title,
      (array_agg(id order by post_date desc, coalesce(views,0) desc))[1] as last_video_id
    from vids where post_date >= current_date - p_days group by uname),
  assigned as (select lower(koc_id) as uname, staff_name from koc_brand_assignments where brand_name='BODYMISS' and coalesce(staff_name,'')<>''),
  bl as (select lower(regexp_replace(id_kenh,'^@','')) as uname from koc_blacklist),
  cast_koc as (
    select lower((regexp_match(channel_link,'@([[:alnum:]._\\-]+)'))[1]) as uname
    from koc_payments where coalesce(cast_net,0) > 0 and channel_link is not null
    union
    select lower(regexp_replace(id_kenh,'^@','')) as uname
    from air_links where nullif(regexp_replace(coalesce(\"cast\",''),'[^0-9]','','g'),'')::numeric > 0)
  select r.uname, r.n_videos, r.total_views, r.total_gmv, r.total_orders, r.last_post,
    f.first_post, (f.first_post >= current_date - p_days) as is_new_creator,
    (a.uname is not null) as da_quan_ly, a.staff_name, (p.username is not null) as in_pool,
    p.avatar, p.followers, p.email, p.sdt, r.top_title, r.last_video_id,
    (c.uname is not null) as has_cast, m.status, m.note, m.marked_by
  from recent r join firsts f on f.uname=r.uname
  left join assigned a on a.uname=r.uname
  left join koc_marketplace_pool p on p.username=r.uname
  left join koc_scout_marks m on m.username=r.uname
  left join cast_koc c on c.uname=r.uname
  where r.total_views >= p_min_views and not exists (select 1 from bl where bl.uname=r.uname)
    and (not p_only_unmanaged or (a.uname is null and c.uname is null))
    and (not p_only_new or f.first_post >= current_date - p_days)
  order by r.total_views desc nulls last limit p_limit offset greatest(p_offset,0);
$function$


-- ===== booking_cast_by_month =====
CREATE OR REPLACE FUNCTION public.booking_cast_by_month(p_from date, p_to date)
 RETURNS TABLE(staff text, air_month text, cast_net numeric, total numeric, orders bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
  with pay as (
    select trim(kp.staff) as staff, kp.cast_net, kp.total, kp.air_date_manual, kp.pay_date,
           nullif(substring(kp.air_link from 'video/([0-9]+)'), '') as vid
    from koc_payments kp where kp.staff is not null and trim(kp.staff) <> ''
  ),
  res as (
    select p.staff, p.cast_net, p.total,
           coalesce(p.air_date_manual, vd.post_date, al.ngay_air, p.pay_date) as air_dt
    from pay p
    left join lateral (select max(post_date) as post_date from tiktok_shop_videos where id = p.vid) vd on true
    left join lateral (select max(ngay_air) as ngay_air from air_links where id_video = p.vid and ngay_air is not null and ngay_air <= date '2026-12-31') al on true
  )
  select staff, to_char(date_trunc('month', air_dt), 'YYYY-MM') as air_month,
         sum(coalesce(cast_net,0))::numeric, sum(coalesce(total,0))::numeric, count(*)::bigint
  from res where air_dt is not null and air_dt >= p_from and air_dt <= p_to
  group by staff, date_trunc('month', air_dt) order by 2, 1;
$function$


-- ===== booking_cast_detail =====
CREATE OR REPLACE FUNCTION public.booking_cast_detail(p_staff text, p_from date, p_to date)
 RETURNS TABLE(channel_link text, air_link text, cast_net numeric, air_date date, pay_date date, brand text, paid boolean, product_name text, video_title text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
  with pay as (
    select kp.channel_link, kp.air_link, kp.cast_net, kp.pay_date, kp.brand, kp.paid, kp.air_date_manual,
           nullif(substring(kp.air_link from 'video/([0-9]+)'), '') as vid
    from koc_payments kp where kp.staff is not null and trim(kp.staff) = trim(p_staff)
  ),
  res as (
    select p.channel_link, p.air_link, p.cast_net, p.pay_date, p.brand, p.paid,
           coalesce(p.air_date_manual, vd.post_date, al.ngay_air, p.pay_date) as air_date,
           vd.product_name, vd.title as video_title
    from pay p
    left join lateral (select post_date, product_name, title from tiktok_shop_videos where id = p.vid order by post_date desc nulls last limit 1) vd on true
    left join lateral (select max(ngay_air) as ngay_air from air_links where id_video = p.vid and ngay_air is not null and ngay_air <= date '2026-12-31') al on true
  )
  select channel_link, air_link, cast_net, air_date, pay_date, brand, paid, product_name, video_title
  from res where air_date is not null and air_date >= p_from and air_date <= p_to
  order by air_date desc;
$function$


-- ===== booking_cast_unresolved =====
CREATE OR REPLACE FUNCTION public.booking_cast_unresolved(p_from date, p_to date)
 RETURNS TABLE(id uuid, staff text, brand text, channel_link text, air_link text, cast_net numeric, pay_date date, reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
  with pay as (
    select kp.id, kp.staff, kp.brand, kp.channel_link, kp.air_link, kp.cast_net, kp.pay_date, kp.air_date_manual,
           nullif(substring(kp.air_link from 'video/([0-9]+)'), '') as vid
    from koc_payments kp
    where coalesce(kp.cast_net,0) > 0 and kp.pay_date >= p_from and kp.pay_date <= p_to
  )
  select p.id, p.staff, p.brand, p.channel_link, p.air_link, p.cast_net, p.pay_date,
         case when coalesce(p.air_link,'') = '' then 'Thiếu link air → tạm dùng ngày thanh toán'
              when p.vid is null then 'Link air không phải link video → tạm dùng ngày thanh toán'
              else 'Chưa có ngày air (video chưa sync) → điền ngày ở Module 5, đang tạm dùng ngày thanh toán' end as reason
  from pay p
  left join lateral (select max(post_date) as post_date from tiktok_shop_videos where id = p.vid) vd on true
  left join lateral (select max(ngay_air) as ngay_air from air_links where id_video = p.vid and ngay_air is not null and ngay_air <= date '2026-12-31') al on true
  where coalesce(p.air_date_manual, vd.post_date, al.ngay_air) is null
  order by p.pay_date desc;
$function$


-- ===== booking_dinhmuc_by_staff_month =====
CREATE OR REPLACE FUNCTION public.booking_dinhmuc_by_staff_month()
 RETURNS TABLE(year integer, month integer, staff text, gmv_cum numeric, dinh_muc numeric, n_video bigint)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '40s'
AS $function$
  with vids as (
    select distinct on (p.year, p.month, p.video_id)
           p.year, p.month, p.video_id, a.nhansu_id, p.gmv
    from tiktok_performance p
    join air_links a on a.id_video = p.video_id
    where a.nhansu_id is not null
    order by p.year, p.month, p.video_id, a.id
  )
  select v.year, v.month, ns.ten_nhansu as staff,
         round(sum(v.gmv))::numeric as gmv_cum,
         greatest(15000000, round(sum(v.gmv) * 0.022))::numeric as dinh_muc,
         count(*)::bigint as n_video
  from vids v
  join nhansu ns on ns.id = v.nhansu_id
  group by v.year, v.month, ns.ten_nhansu;
$function$


-- ===== brand_booking_products =====
CREATE OR REPLACE FUNCTION public.brand_booking_products(p_brand_ids uuid[], p_start date, p_end date)
 RETURNS TABLE(sanpham text, so_luong bigint, so_don bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select s.ten_sanpham,
    sum(ct.so_luong)::bigint,
    count(distinct d.id)::bigint
  from chitiettonguis ct
  join sanphams s on s.id = ct.sanpham_id
  join donguis d on d.id = ct.dongui_id
  where s.brand_id = any(p_brand_ids)
    and d.trang_thai = 'Đã đóng đơn'
    and (d.ngay_gui at time zone 'Asia/Ho_Chi_Minh')::date between p_start and p_end
  group by s.ten_sanpham
  order by 2 desc;
$function$


-- ===== brand_booking_staff =====
CREATE OR REPLACE FUNCTION public.brand_booking_staff(p_brand_ids uuid[], p_start date, p_end date)
 RETURNS TABLE(nhansu_id uuid, ten_nhansu text, so_don bigint, so_luong bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select d.nhansu_id, coalesce(n.ten_nhansu, '(không rõ)'),
    count(distinct d.id)::bigint,
    sum(ct.so_luong)::bigint
  from chitiettonguis ct
  join sanphams s on s.id = ct.sanpham_id
  join donguis d on d.id = ct.dongui_id
  left join nhansu n on n.id = d.nhansu_id
  where s.brand_id = any(p_brand_ids)
    and d.trang_thai = 'Đã đóng đơn'
    and (d.ngay_gui at time zone 'Asia/Ho_Chi_Minh')::date between p_start and p_end
  group by d.nhansu_id, n.ten_nhansu
  order by 3 desc;
$function$


-- ===== cs_return_dashboard =====
CREATE OR REPLACE FUNCTION public.cs_return_dashboard(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '40s'
AS $function$
with sp_ret as (
  select coalesce(o.shop_name,'Không rõ') as shop, o.order_sn,
         to_timestamp(o.create_time)::date as d,
         coalesce(o.total_amount,0) as amt,
         left(coalesce(case when jsonb_typeof(o.items)='string' then (o.items #>> '{}')::jsonb -> 0 ->> 'item_name' end,'Không rõ'),150) as pname
  from shopee_orders o
  where o.order_status='TO_RETURN' and to_timestamp(o.create_time)::date between p_from and p_to
),
sp_all as (
  select coalesce(o.shop_name,'Không rõ') as shop, count(*) as n
  from shopee_orders o
  where to_timestamp(o.create_time)::date between p_from and p_to
  group by 1
),
tt_ret as (
  select coalesce(m.seller_name, o.shop_id,'Không rõ') as shop, o.order_id,
         o.order_date as d,
         sum(o.price_amount*o.quantity) as amt,
         left(coalesce(max(pc.name), max(o.product_id)),150) as pname
  from tiktok_affiliate_orders o
  left join tiktok_affiliate_sync_meta m on m.shop_id=o.shop_id
  left join tiktok_product_cache pc on pc.product_id=o.product_id
  where o.fully_return='Yes' and o.order_date between p_from and p_to
  group by 1,2,3
),
tt_all as (
  select coalesce(m.seller_name, o.shop_id,'Không rõ') as shop, count(distinct o.order_id) as n
  from tiktok_affiliate_orders o
  left join tiktok_affiliate_sync_meta m on m.shop_id=o.shop_id
  where o.order_date between p_from and p_to
  group by 1
),
shops as (
  select 'shopee' as san, r.shop, count(*)::bigint as don_tra, coalesce(sum(r.amt),0)::numeric as gia_tri,
         coalesce(max(a.n),0)::bigint as tong_don
  from sp_ret r left join sp_all a on a.shop=r.shop group by 1,2
  union all
  select 'tiktok', r.shop, count(*)::bigint, coalesce(sum(r.amt),0)::numeric, coalesce(max(a.n),0)::bigint
  from tt_ret r left join tt_all a on a.shop=r.shop group by 1,2
),
prods as (
  select 'shopee' as san, shop, pname, count(*)::bigint as don_tra, coalesce(sum(amt),0)::numeric as gia_tri
  from sp_ret group by 1,2,3
  union all
  select 'tiktok', shop, pname, count(*)::bigint, coalesce(sum(amt),0)::numeric from tt_ret group by 1,2,3
),
trend as (
  select d, sum(n)::bigint as don_tra from (
    select d, count(*) as n from sp_ret group by d
    union all select d, count(*) from tt_ret group by d
  ) z group by d
)
select jsonb_build_object(
  'tong_don_tra', (select coalesce(sum(don_tra),0) from shops),
  'tong_gia_tri', (select coalesce(sum(gia_tri),0) from shops),
  'tong_don', (select coalesce(sum(tong_don),0) from shops),
  'shops', (select coalesce(jsonb_agg(x order by x.don_tra desc),'[]'::jsonb) from (
      select san, shop, don_tra, tong_don, gia_tri,
             round(100.0*don_tra/nullif(tong_don,0),2) as ty_le
      from shops) x),
  'top_products', (select coalesce(jsonb_agg(y order by y.don_tra desc),'[]'::jsonb) from (
      select san, shop, pname, don_tra, gia_tri from prods order by don_tra desc limit 20) y),
  'trend', (select coalesce(jsonb_agg(t order by t.d),'[]'::jsonb) from (select d, don_tra from trend) t)
);
$function$


-- ===== cs_seed_return_cases =====
CREATE OR REPLACE FUNCTION public.cs_seed_return_cases(p_days integer DEFAULT 60)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int := 0; n2 int := 0;
begin
  insert into cs_cases(case_type, platform, order_sn, shop_name, buyer_name, product_summary, status, source, order_key)
  select 'return','shopee', o.order_sn, o.shop_name, o.buyer_username,
    left(coalesce(((o.items #>> '{}')::jsonb -> 0 ->> 'item_name'), ''), 200), 'new','auto','shopee|'||o.order_sn
  from shopee_orders o
  where o.order_status='TO_RETURN' and o.items is not null and jsonb_typeof(o.items)='string'
    and to_timestamp(o.create_time)::date >= current_date - p_days
  on conflict (order_key) do nothing;
  get diagnostics n = row_count;

  insert into cs_cases(case_type, platform, order_sn, shop_name, buyer_name, product_summary, status, source, order_key)
  select 'return','tiktok', o.order_id, m.seller_name, o.creator_username,
    left(coalesce(pc.name, o.product_id), 200), 'new','auto','tiktok|'||o.order_id
  from tiktok_affiliate_orders o
  left join tiktok_product_cache pc on pc.product_id = o.product_id
  left join tiktok_affiliate_sync_meta m on m.shop_id = o.shop_id
  where o.fully_return='Yes' and o.order_date >= current_date - p_days
  on conflict (order_key) do nothing;
  get diagnostics n2 = row_count;
  return n + n2;
end $function$


-- ===== daily_report_kpi =====
CREATE OR REPLACE FUNCTION public.daily_report_kpi(p_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '30s'
AS $function$
  select jsonb_build_object(
    'shopee_orders',  (select count(*) from shopee_orders where to_timestamp(create_time)::date = p_date),
    'shopee_gmv',     (select coalesce(sum(gmv),0)::bigint from shopee_orders where to_timestamp(create_time)::date = p_date),
    'shopee_cancel',  (select count(*) from shopee_orders where to_timestamp(create_time)::date = p_date and order_status in ('CANCELLED','IN_CANCEL')),
    'tiktok_orders',  (select count(*) from tiktok_affiliate_orders where order_date = p_date),
    'tiktok_gmv',     (select coalesce(sum(price_amount*quantity),0)::bigint from tiktok_affiliate_orders where order_date = p_date),
    'return_open',    (select count(*) from cs_cases where case_type='return'    and status <> 'done'),
    'complaint_open', (select count(*) from cs_cases where case_type='complaint' and status <> 'done'),
    'cases_open',     (select count(*) from cs_cases where status <> 'done'),
    'cases_overdue',  (select count(*) from cs_cases where status <> 'done' and created_at::date <= current_date - 3),
    'voucher_new',    (select count(*) from support_vouchers where issue_date = p_date),
    'voucher_value',  (select coalesce(sum(amount),0)::bigint from support_vouchers where issue_date = p_date),
    'defect_new',     (select count(*) from defect_products where report_date = p_date),
    'seeding_spend',  (select coalesce(sum(total),0)::bigint from seeding_payments where pay_date = p_date)
  );
$function$


-- ===== generate_air_links_report =====
CREATE OR REPLACE FUNCTION public.generate_air_links_report(target_month integer, target_year integer)
 RETURNS TABLE(nhansu_id uuid, ten_nhansu text, sl_video_air bigint, chi_phi_cast numeric, brand_counts_air jsonb)
 LANGUAGE plpgsql
 SET statement_timeout TO '30s'
AS $function$
begin
  return query
  with tgt as (
    select make_date(target_year, target_month, 1) as m0,
           (make_date(target_year, target_month, 1) + interval '1 month' - interval '1 day')::date as m1
  ),
  air_data as (
    select al.nhansu_id, b.ten_brand, count(al.id) as sl
    from air_links al left join brands b on al.brand_id = b.id
    where extract(month from coalesce(al.ngay_air, al.ngay_booking)) = target_month
      and extract(year  from coalesce(al.ngay_air, al.ngay_booking)) = target_year
      and al.nhansu_id is not null and al.brand_id is not null
    group by al.nhansu_id, b.ten_brand
  ),
  pay as (
    select trim(kp.staff) as staff, kp.cast_net, kp.air_date_manual, kp.pay_date,
           nullif(substring(kp.air_link from 'video/([0-9]+)'),'') as vid
    from koc_payments kp
    where kp.staff is not null and trim(kp.staff) <> '' and coalesce(kp.cast_net,0) > 0
  ),
  pay_dt as (
    select p.staff, p.cast_net,
           coalesce(p.air_date_manual, vd.post_date, alr.ngay_air, p.pay_date) as air_dt
    from pay p
    left join lateral (select max(post_date) as post_date from tiktok_shop_videos where id = p.vid) vd on true
    left join lateral (select max(ngay_air) as ngay_air from air_links where id_video = p.vid and ngay_air is not null and ngay_air <= date '2026-12-31') alr on true
  ),
  cast_by_ns as (
    select n.id as nhansu_id, sum(pd.cast_net) as chi_phi
    from pay_dt pd
    join nhansu n on lower(trim(n.ten_nhansu)) = lower(trim(pd.staff)), tgt
    where pd.air_dt >= tgt.m0 and pd.air_dt <= tgt.m1
    group by n.id
  )
  select ns.id, ns.ten_nhansu,
    coalesce(sum(ad.sl)::bigint, 0) as sl_video_air,
    coalesce(max(cb.chi_phi), 0)::numeric as chi_phi_cast,
    jsonb_object_agg(ad.ten_brand, ad.sl) filter (where ad.ten_brand is not null) as brand_counts_air
  from nhansu ns
  left join air_data ad on ns.id = ad.nhansu_id
  left join cast_by_ns cb on cb.nhansu_id = ns.id
  group by ns.id, ns.ten_nhansu;
end;
$function$


-- ===== generate_performance_report =====
CREATE OR REPLACE FUNCTION public.generate_performance_report(target_month integer, target_year integer)
 RETURNS TABLE(nhansu_id uuid, ten_nhansu text, sl_order bigint, chi_phi_tong numeric, aov_don_order numeric, brand_counts jsonb)
 LANGUAGE plpgsql
AS $function$
DECLARE
  d_start timestamptz := make_date(target_year, target_month, 1)::timestamptz;
  d_end   timestamptz := (make_date(target_year, target_month, 1) + interval '1 month')::timestamptz;
BEGIN
  RETURN QUERY
  WITH latest_col AS MATERIALIZED (
    SELECT h AS col FROM costing_data, jsonb_array_elements_text(headers) h
    WHERE h LIKE 'COSTING T% AMIS V2'
    ORDER BY (regexp_match(h, 'T(\\d+)\\.(\\d+) AMIS V2'))[2]::int DESC,
             (regexp_match(h, 'T(\\d+)\\.(\\d+) AMIS V2'))[1]::int DESC
    LIMIT 1
  ),
  cost_map AS MATERIALIZED (
    SELECT barcode, MAX(cost) AS cost
    FROM (
      SELECT r->>'Mã' AS barcode,
             CASE WHEN trim(replace((r->>lc.col), ',', '')) ~ '^[0-9]+(\\.[0-9]+)?$'
                  THEN trim(replace((r->>lc.col), ',', ''))::numeric
                  ELSE NULL END AS cost
      FROM costing_data cd, latest_col lc, jsonb_array_elements(cd.rows) r
      WHERE cd.key = 'latest'
    ) x
    WHERE barcode IS NOT NULL AND barcode <> ''
    GROUP BY barcode
  ),
  per_order AS (
    SELECT dg.id,
           dg.nhansu_id,
           COALESCE(SUM(cm.cost * 1.08 * ctg.so_luong), 0)
             + 5000
             + CASE WHEN dg.loai_ship = 'Hỏa tốc' THEN 50000 ELSE 20000 END AS order_total
    FROM donguis dg
    LEFT JOIN chitiettonguis ctg ON ctg.dongui_id = dg.id
    LEFT JOIN sanphams sp ON ctg.sanpham_id = sp.id
    LEFT JOIN cost_map cm ON cm.barcode = sp.barcode
    WHERE dg.ngay_gui >= d_start AND dg.ngay_gui < d_end
    GROUP BY dg.id, dg.nhansu_id, dg.loai_ship
  ),
  ns_cost AS (
    SELECT po.nhansu_id        AS ns_id,
           COUNT(*)            AS sl_order,
           SUM(po.order_total) AS chi_phi_tong
    FROM per_order po
    GROUP BY po.nhansu_id
  ),
  ns_brand AS (
    SELECT t.nhansu_id AS ns_id,
           jsonb_object_agg(t.ten_brand, t.brand_count) AS brand_counts
    FROM (
      SELECT dg2.nhansu_id, b2.ten_brand,
             COUNT(DISTINCT ctg2.dongui_id) AS brand_count
      FROM donguis dg2
      JOIN chitiettonguis ctg2 ON ctg2.dongui_id = dg2.id
      JOIN sanphams sp2 ON ctg2.sanpham_id = sp2.id
      JOIN brands b2 ON sp2.brand_id = b2.id
      WHERE dg2.ngay_gui >= d_start AND dg2.ngay_gui < d_end
      GROUP BY dg2.nhansu_id, b2.ten_brand
    ) t
    GROUP BY t.nhansu_id
  )
  SELECT
    ns.id AS nhansu_id,
    ns.ten_nhansu,
    COALESCE(nc.sl_order, 0)      AS sl_order,
    COALESCE(nc.chi_phi_tong, 0)  AS chi_phi_tong,
    CASE WHEN COALESCE(nc.sl_order, 0) > 0
         THEN nc.chi_phi_tong / nc.sl_order
         ELSE 0 END               AS aov_don_order,
    COALESCE(nb.brand_counts, '{}'::jsonb) AS brand_counts
  FROM nhansu ns
  LEFT JOIN ns_cost  nc ON nc.ns_id = ns.id
  LEFT JOIN ns_brand nb ON nb.ns_id = ns.id;
END;
$function$


-- ===== get_product_summary =====
CREATE OR REPLACE FUNCTION public.get_product_summary(query_date date)
 RETURNS TABLE(loai_ship text, ten_san_pham text, barcode text, ten_brand text, total_quantity bigint)
 LANGUAGE plpgsql
AS $function$\r
BEGIN\r
    RETURN QUERY\r
    SELECT \r
        dg.loai_ship,\r
        sp.ten_sanpham as ten_san_pham,\r
        sp.barcode::TEXT,\r
        b.ten_brand,\r
        SUM(ctg.so_luong) as total_quantity\r
    FROM \r
        chitiettonguis ctg\r
    JOIN \r
        donguis dg ON ctg.dongui_id = dg.id  -- Đã sửa don_gui_id thành dongui_id\r
    JOIN \r
        sanphams sp ON ctg.sanpham_id = sp.id\r
    LEFT JOIN \r
        brands b ON sp.brand_id = b.id\r
    WHERE \r
        DATE(dg.ngay_gui) = query_date\r
    GROUP BY \r
        dg.loai_ship, sp.ten_sanpham, sp.barcode, b.ten_brand;\r
END;\r
$function$


-- ===== get_product_summary_by_day =====
CREATE OR REPLACE FUNCTION public.get_product_summary_by_day(target_day date)
 RETURNS TABLE(ten_san_pham text, barcode text, ten_brand text, total_quantity bigint)
 LANGUAGE plpgsql
AS $function$\r
BEGIN\r
  RETURN QUERY\r
  SELECT\r
    sp.ten_sanpham,\r
    sp.barcode,\r
    b.ten_brand,\r
    SUM(ctdg.so_luong) as total_quantity\r
  FROM\r
    public.donguis dg\r
  JOIN\r
    public.chitiettonguis ctdg ON dg.id = ctdg.don_gui_id\r
  JOIN\r
    public.sanphams sp ON ctdg.sanpham_id = sp.id\r
  JOIN\r
    public.brands b ON sp.brand_id = b.id\r
  WHERE\r
    dg.ngay_gui >= target_day AND dg.ngay_gui < target_day + INTERVAL '1 day'\r
  GROUP BY\r
    sp.ten_sanpham, sp.barcode, b.ten_brand\r
  ORDER BY\r
    total_quantity DESC;\r
END;\r
$function$


-- ===== get_product_summary_by_day_grouped =====
CREATE OR REPLACE FUNCTION public.get_product_summary_by_day_grouped(target_day date)
 RETURNS TABLE(loai_ship text, ten_san_pham text, barcode text, ten_brand text, total_quantity bigint)
 LANGUAGE plpgsql
AS $function$\r
BEGIN\r
    RETURN QUERY\r
    SELECT\r
        dg.loai_ship,\r
        sp.ten_sanpham,\r
        sp.barcode,\r
        b.ten_brand,\r
        sum(ctg.so_luong) AS total_quantity\r
    FROM\r
        donguis dg\r
    JOIN\r
        chitiettonguis ctg ON dg.id = ctg.don_gui_id\r
    JOIN\r
        sanphams sp ON ctg.sanpham_id = sp.id\r
    JOIN\r
        brands b ON sp.brand_id = b.id\r
    WHERE\r
        DATE(dg.ngay_gui) = target_day\r
    GROUP BY\r
        dg.loai_ship, sp.id, b.id\r
    ORDER BY\r
        dg.loai_ship, sp.ten_sanpham;\r
END;\r
$function$


-- ===== get_staff_product_summary =====
CREATE OR REPLACE FUNCTION public.get_staff_product_summary(target_day date)
 RETURNS TABLE(ten_nhansu text, ten_brand text, ten_san_pham text, total_quantity bigint)
 LANGUAGE plpgsql
AS $function$\r
BEGIN\r
    RETURN QUERY\r
    SELECT\r
        ns.ten_nhansu,\r
        b.ten_brand,\r
        sp.ten_sanpham,\r
        sum(ctg.so_luong) AS total_quantity\r
    FROM\r
        donguis dg\r
    JOIN\r
        chitiettonguis ctg ON dg.id = ctg.don_gui_id\r
    JOIN\r
        sanphams sp ON ctg.sanpham_id = sp.id\r
    JOIN\r
        brands b ON sp.brand_id = b.id\r
    JOIN\r
        nhansu ns ON dg.nhansu_id = ns.id\r
    WHERE\r
        DATE(dg.ngay_gui) = target_day\r
    GROUP BY\r
        ns.ten_nhansu, b.ten_brand, sp.ten_sanpham\r
    ORDER BY\r
        ns.ten_nhansu, b.ten_brand, sp.ten_sanpham;\r
END;\r
$function$


-- ===== koc_assignment_warnings =====
CREATE OR REPLACE FUNCTION public.koc_assignment_warnings(p_shop_id text, p_brand text)
 RETURNS TABLE(koc_id text, staff_name text, since_date date, days_since integer, video_count bigint, last_air date, days_since_air integer, limit_days integer, owes_clip boolean, last_order_at date)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '25s'
AS $function$
  with a as (
    select a.koc_id, lower(regexp_replace(a.koc_id,'^@','')) uname, a.staff_name,
           coalesce(a.approved_at, a.assigned_at)::date as since_date, a.last_order_at
    from koc_brand_assignments a
    where a.brand_name = p_brand and a.status = 'approved'
  ),
  vu_raw as (
    select lower(regexp_replace(creator_username,'^@','')) uname, content_id vid, min(order_date)::date post_d
      from tiktok_affiliate_orders where shop_id = p_shop_id and content_type='VIDEO' and coalesce(content_id,'')<>'' group by 1,2
    union all
    select lower(regexp_replace(coalesce(username,''),'^@','')) uname, id vid, post_date
      from tiktok_shop_videos where shop_id = p_shop_id
  ),
  vu as (select uname, vid, min(post_d) post_d from vu_raw
    where uname in (select uname from a) group by 1,2),
  agg as (
    select a.koc_id, a.uname, a.staff_name, a.since_date, a.last_order_at,
      count(vu.vid) filter (where vu.post_d >= a.since_date) as video_count,
      max(vu.post_d) as last_air
    from a left join vu on vu.uname = a.uname
    group by a.koc_id, a.uname, a.staff_name, a.since_date, a.last_order_at
  ),
  f as (select *, (last_order_at is not null and (last_air is null or last_air < last_order_at)) as owes from agg)
  select koc_id, staff_name, since_date, (current_date - since_date) as days_since,
    video_count, last_air,
    case when owes then (current_date - last_order_at)
         else (current_date - coalesce(last_air, since_date)) end as days_since_air,
    case when owes then 30
         when last_air is null then 45
         when since_date <= last_air then 45
         when (since_date - last_air) > 45 then (since_date - last_air) + 10
         else 50 end as limit_days,
    owes as owes_clip, last_order_at
  from f;
$function$


-- ===== koc_cast_by_creator =====
CREATE OR REPLACE FUNCTION public.koc_cast_by_creator(p_shop_id text, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS TABLE(creator_username text, cast_total numeric)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '25s'
AS $function$
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
    from (select kp.cast_net, (regexp_matches(kp.air_link, '/video/(\\d{6,})', 'g'))[1] as content_id,
            count(*) over (partition by kp.id) as cnt
          from koc_payments kp
          where coalesce(kp.air_link,'') <> '' and coalesce(kp.cast_net,0) > 0) z
    where content_id in (select content_id from cids) group by content_id)
  select v.uname as creator_username, sum(pc.cast_amount)::numeric as cast_total
  from vids v join pay_cast pc on pc.content_id = v.content_id
  group by v.uname;
$function$


-- ===== koc_clip_detail =====
CREATE OR REPLACE FUNCTION public.koc_clip_detail(p_ch text, p_brand text, p_floor date DEFAULT '2026-06-01'::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '15s'
AS $function$
  with brand_shop(bkey, shop_id) as (values
    ('BODYMISS','7495107349171898427'),
    ('REALSTEEL','7496180170889726491'),
    ('EHERB','7494529979361168222'), ('EHERB','7495838925500090511'),
    ('MILAGANICS','7494813818973817115'),
    ('MOAWMOAWS','7495831977917385095'),
    ('HEALMI','7494251668499498533')),
  dons as (
    select dg.id, dg.ngay_gui::date as ngay, dg.san_pham_chi_tiet as sp, n.ten_nhansu as staff
    from donguis dg
    join chitiettonguis ct on ct.dongui_id = dg.id
    join sanphams sp2 on ct.sanpham_id = sp2.id
    join brands b on sp2.brand_id = b.id
    left join nhansu n on n.id = dg.nhansu_id
    where lower(trim(regexp_replace(coalesce(dg.koc_id_kenh,''),'^@',''))) = p_ch
      and upper(regexp_replace(coalesce(b.ten_brand,''),'[^A-Za-z0-9]','','g')) = p_brand
      and dg.ngay_gui::date >= p_floor
    group by dg.id, dg.ngay_gui, dg.san_pham_chi_tiet, n.ten_nhansu
  ),
  clips as (
    select distinct v.id, v.username, v.post_date, v.title,
      coalesce((select sum(mv.views) from tiktok_video_monthly_views mv where mv.id = v.id), 0) as views
    from tiktok_shop_videos v join brand_shop bs on bs.shop_id = v.shop_id
    where lower(trim(regexp_replace(coalesce(v.username,''),'^@',''))) = p_ch
      and bs.bkey = p_brand and v.post_date >= p_floor
  )
  select jsonb_build_object(
    'dons', (select coalesce(jsonb_agg(jsonb_build_object('ngay', to_char(ngay,'DD/MM'), 'sp', sp, 'staff', staff) order by ngay desc), '[]'::jsonb) from dons),
    'clips', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'username', username, 'post', to_char(post_date,'DD/MM/YYYY'), 'views', views, 'title', title) order by post_date desc), '[]'::jsonb) from clips)
  );
$function$


-- ===== koc_clip_status =====
CREATE OR REPLACE FUNCTION public.koc_clip_status(p_floor date DEFAULT '2026-06-01'::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '25s'
AS $function$
  with brand_shop(bkey, shop_id) as (values
    ('BODYMISS','7495107349171898427'),
    ('REALSTEEL','7496180170889726491'),
    ('EHERB','7494529979361168222'), ('EHERB','7495838925500090511'),
    ('MILAGANICS','7494813818973817115'),
    ('MOAWMOAWS','7495831977917385095'),
    ('HEALMI','7494251668499498533')),
  ord as (
    select dg.id as dongui_id,
      trim(dg.koc_id_kenh) as id_kenh_raw,
      lower(trim(regexp_replace(coalesce(dg.koc_id_kenh,''),'^@',''))) as ch,
      upper(regexp_replace(coalesce(b.ten_brand,''),'[^A-Za-z0-9]','','g')) as bkey,
      dg.ngay_gui::date as ngay_gui, n.ten_nhansu as staff
    from donguis dg
    join chitiettonguis ct on ct.dongui_id = dg.id
    join sanphams sp on ct.sanpham_id = sp.id
    join brands b on sp.brand_id = b.id
    left join nhansu n on n.id = dg.nhansu_id
    where dg.ngay_gui::date >= p_floor and coalesce(trim(dg.koc_id_kenh),'') <> ''
  ),
  grp as (
    select ch, bkey,
      max(id_kenh_raw) as id_kenh,
      count(distinct dongui_id) as so_don,
      min(ngay_gui) as gui_dau, max(ngay_gui) as gui_cuoi,
      (array_agg(staff order by ngay_gui desc))[1] as staff
    from ord group by ch, bkey
  ),
  vids as (
    select bs.bkey, lower(trim(regexp_replace(coalesce(v.username,''),'^@',''))) as ch, v.post_date
    from tiktok_shop_videos v join brand_shop bs on bs.shop_id = v.shop_id
    where v.post_date >= p_floor
  ),
  clip as (
    select g.ch, g.bkey,
      count(vv.post_date) filter (where vv.post_date >= g.gui_dau) as so_clip,
      max(vv.post_date) filter (where vv.post_date >= g.gui_dau) as clip_cuoi
    from grp g left join vids vv on vv.bkey = g.bkey and vv.ch = g.ch
    group by g.ch, g.bkey
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id_kenh', g.id_kenh, 'brand', g.bkey, 'staff', g.staff,
    'so_don', g.so_don,
    'gui_cuoi', to_char(g.gui_cuoi,'DD/MM'),
    'days_ago', (current_date - g.gui_cuoi),
    'mapped', (g.bkey in (select bkey from brand_shop)),
    'so_clip', coalesce(c.so_clip,0),
    'clip_cuoi', to_char(c.clip_cuoi,'DD/MM'),
    'co_clip', coalesce(c.so_clip,0) > 0
  ) order by (coalesce(c.so_clip,0) > 0), g.gui_cuoi desc), '[]'::jsonb)
  from grp g left join clip c on c.ch = g.ch and c.bkey = g.bkey;
$function$


-- ===== koc_gmv_by_content =====
CREATE OR REPLACE FUNCTION public.koc_gmv_by_content(p_shop_id text, p_start date, p_end date)
 RETURNS TABLE(gmv_video numeric, gmv_live numeric, gmv_linkshare numeric, gmv_shop numeric, gmv_other numeric)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '20s'
AS $function$
  select
    coalesce(sum(price_amount*quantity) filter (where content_type='VIDEO'),0)::numeric,
    coalesce(sum(price_amount*quantity) filter (where content_type='LIVE'),0)::numeric,
    coalesce(sum(price_amount*quantity) filter (where content_type='LINKSHARE'),0)::numeric,
    coalesce(sum(price_amount*quantity) filter (where content_type='SHOP'),0)::numeric,
    coalesce(sum(price_amount*quantity) filter (where content_type is null or content_type not in ('VIDEO','LIVE','LINKSHARE','SHOP')),0)::numeric
  from tiktok_affiliate_orders
  where (p_shop_id is null or shop_id = p_shop_id)
    and (p_start is null or order_date >= p_start)
    and (p_end   is null or order_date <= p_end)
    and creator_username is not null and creator_username <> '';
$function$


-- ===== koc_hunt_list =====
CREATE OR REPLACE FUNCTION public.koc_hunt_list(p_only_new boolean DEFAULT false, p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)
 RETURNS TABLE(username text, nickname text, avatar text, followers bigint, avg_views bigint, gmv_tier text, region text, categories jsonb, da_lien_he boolean, lien_he_boi text, ghi_chu text, updated_at timestamp with time zone, brands_done text[], open_id text, moi_im_at timestamp with time zone, moi_collab_at timestamp with time zone, email text, sdt text, bio text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
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
    p.open_id, p.moi_im_at, p.moi_collab_at,
    p.email, p.sdt, p.bio
  from koc_marketplace_pool p left join done d on d.uname=p.username
  where (not p_only_new or d.uname is null)
  order by p.followers desc nulls last limit p_limit offset p_offset;
$function$


-- ===== koc_last_sample_order =====
CREATE OR REPLACE FUNCTION public.koc_last_sample_order(p_brand text)
 RETURNS TABLE(uname text, last_order date, days_since integer, order_count bigint, recent jsonb)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '20s'
AS $function$
  with bo as (
    select distinct d.id, lower(regexp_replace(d.koc_id_kenh,'^@','')) as uname,
           d.ngay_gui, d.nhansu_id, d.loai_ship
    from donguis d
    join chitiettonguis ct on ct.dongui_id = d.id
    join sanphams sp on sp.id = ct.sanpham_id
    join brands b on b.id = sp.brand_id
    where coalesce(d.koc_id_kenh,'') <> ''
      and left(upper(replace(b.ten_brand,' ','')),6) = left(upper(replace(p_brand,' ','')),6)
  )
  select g.uname, g.last_order, g.days_since, g.order_count,
    (select jsonb_agg(jsonb_build_object(
        'd', to_char(x.ngay_gui,'DD/MM/YYYY'), 'ns', coalesce(n.ten_nhansu,'?'), 'ship', x.loai_ship
      ) order by x.ngay_gui desc)
     from (select * from bo x2 where x2.uname = g.uname order by x2.ngay_gui desc limit 6) x
     left join nhansu n on n.id = x.nhansu_id) as recent
  from (
    select uname, max(ngay_gui)::date as last_order,
           (current_date - max(ngay_gui)::date)::int as days_since, count(*) as order_count
    from bo group by uname
  ) g;
$function$


-- ===== koc_last_sample_order =====
CREATE OR REPLACE FUNCTION public.koc_last_sample_order(p_brand text, p_kocs text[] DEFAULT NULL::text[])
 RETURNS TABLE(uname text, last_order date, days_since integer, order_count bigint, recent jsonb)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '20s'
AS $function$
  with bo as (
    select distinct d.id, lower(regexp_replace(d.koc_id_kenh,'^@','')) as uname,
           d.ngay_gui, d.nhansu_id, d.loai_ship
    from donguis d
    join chitiettonguis ct on ct.dongui_id = d.id
    join sanphams sp on sp.id = ct.sanpham_id
    join brands b on b.id = sp.brand_id
    where coalesce(d.koc_id_kenh,'') <> ''
      and left(upper(replace(b.ten_brand,' ','')),6) = left(upper(replace(p_brand,' ','')),6)
      and (p_kocs is null or lower(regexp_replace(d.koc_id_kenh,'^@','')) = any(p_kocs))
  )
  select g.uname, g.last_order, g.days_since, g.order_count,
    (select jsonb_agg(jsonb_build_object(
        'd', to_char(x.ngay_gui,'DD/MM/YYYY'), 'ns', coalesce(n.ten_nhansu,'?'), 'ship', x.loai_ship
      ) order by x.ngay_gui desc)
     from (select * from bo x2 where x2.uname = g.uname order by x2.ngay_gui desc limit 6) x
     left join nhansu n on n.id = x.nhansu_id) as recent
  from (
    select uname, max(ngay_gui)::date as last_order,
           (current_date - max(ngay_gui)::date)::int as days_since, count(*) as order_count
    from bo group by uname
  ) g;
$function$


-- ===== koc_latest_cast =====
CREATE OR REPLACE FUNCTION public.koc_latest_cast()
 RETURNS TABLE(uname text, last_cast numeric, last_date date, brand text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
  select distinct on (uname) uname, cast_net as last_cast, pay_date as last_date, brand
  from (
    select lower((regexp_match(channel_link, '@([^/?#]+)'))[1]) as uname,
           cast_net, pay_date, brand
    from koc_payments
    where channel_link ~ '@' and cast_net is not null and cast_net > 0
  ) z
  where uname is not null and uname <> ''
  order by uname, last_date desc nulls last;
$function$


-- ===== koc_no_video_warnings =====
CREATE OR REPLACE FUNCTION public.koc_no_video_warnings()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '20s'
AS $function$
  with rng as (select (now() - interval '14 days')::date as d_late, date '2026-06-01' as d_floor),
  brand_shop(bkey, shop_id) as (values
    ('BODYMISS','7495107349171898427'),
    ('REALSTEEL','7496180170889726491'),
    ('EHERB','7494529979361168222'), ('EHERB','7495838925500090511'),
    ('MILAGANICS','7494813818973817115'),
    ('MOAWMOAWS','7495831977917385095'),
    ('HEALMI','7494251668499498533')),
  ord as (
    select distinct dg.id as dongui_id, trim(dg.koc_id_kenh) as id_kenh,
      lower(trim(regexp_replace(coalesce(dg.koc_id_kenh,''),'^@',''))) as ch,
      upper(regexp_replace(coalesce(b.ten_brand,''),'[^A-Za-z0-9]','','g')) as bkey,
      dg.ngay_gui::date as ngay_gui, n.ten_nhansu as staff
    from donguis dg
    join chitiettonguis ct on ct.dongui_id = dg.id
    join sanphams sp on ct.sanpham_id = sp.id
    join brands b on sp.brand_id = b.id
    left join nhansu n on n.id = dg.nhansu_id, rng
    where dg.ngay_gui::date <= rng.d_late and dg.ngay_gui::date >= rng.d_floor
      and coalesce(trim(dg.koc_id_kenh),'') <> ''
      and not exists (select 1 from koc_video_warning_dismissed x where x.dongui_id = dg.id)
  ),
  vids as materialized (
    select shop_id, ch, post_date from (
      select o.shop_id, lower(regexp_replace(coalesce(o.creator_username,''),'^@','')) as ch, o.order_date::date as post_date
        from tiktok_affiliate_orders o, rng
        where o.shop_id in (select shop_id from brand_shop)
          and o.content_type = 'VIDEO' and coalesce(o.content_id,'') <> '' and o.order_date >= rng.d_floor
      union all
      select v.shop_id, lower(regexp_replace(coalesce(v.username,''),'^@','')) as ch, v.post_date
        from tiktok_shop_videos v, rng
        where v.shop_id in (select shop_id from brand_shop) and v.post_date >= rng.d_floor
    ) z
  ),
  warned as (
    select o.* from ord o
    where o.bkey in (select bkey from brand_shop)
      and not exists (
        select 1 from brand_shop bs join vids vv on vv.shop_id = bs.shop_id and vv.ch = o.ch and vv.post_date >= o.ngay_gui
        where bs.bkey = o.bkey)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'dongui_id', dongui_id, 'id_kenh', id_kenh, 'brand', bkey, 'staff', staff,
    'ngay_gui', to_char(ngay_gui,'DD/MM'), 'days_ago', (current_date - ngay_gui)
  ) order by ngay_gui), '[]'::jsonb)
  from warned;
$function$


-- ===== koc_order_stats =====
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
  -- tên hiển thị cho KOC chỉ-có-video (không có dòng đơn): lấy username gốc từ bảng video
  vdisp as (
    select lower(regexp_replace(username, '^@', '')) as uname, max(username) as disp
    from tiktok_shop_videos
    where (p_shop_id is null or shop_id = p_shop_id) and coalesce(username,'') <> ''
      and (p_search is null or username ilike '%'||p_search||'%')
    group by 1
  )
  -- (1) KOC có đơn — GIỮ NGUYÊN như cũ
  select o.creator_username, o.orders, o.gmv, o.qty, o.commission, o.videos, o.lives, o.products, o.last_order,
    coalesce(v.vtotal, 0)  as vtotal,
    coalesce(v.vperiod, 0) as vperiod
  from o left join v on v.uname = lower(regexp_replace(o.creator_username, '^@', ''))
  union all
  -- (2) KOC CHỈ có video (0 đơn) — chỉ thêm khi đang SEARCH, để tab chính không đổi
  select vd.disp, 0::bigint, 0::numeric, 0::bigint, 0::numeric,
    0::bigint, 0::bigint, 0::bigint, 0::bigint,
    coalesce(v.vtotal, 0), coalesce(v.vperiod, 0)
  from v
  join vdisp vd on vd.uname = v.uname
  where p_search is not null
    and not exists (select 1 from o where lower(regexp_replace(o.creator_username, '^@', '')) = v.uname)
  order by 3 desc, 11 desc;
$function$


-- ===== koc_order_totals =====
CREATE OR REPLACE FUNCTION public.koc_order_totals(p_shop_id text, p_start date, p_end date)
 RETURNS TABLE(creators bigint, orders bigint, gmv numeric, qty bigint, commission numeric, commission_actual numeric)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '20s'
AS $function$
  select count(distinct creator_username) as creators,
    count(distinct order_id) as orders,
    coalesce(sum(price_amount * quantity), 0) as gmv,
    coalesce(sum(quantity), 0) as qty,
    coalesce(sum(est_commission), 0) as commission,
    coalesce(sum(actual_commission), 0) as commission_actual
  from tiktok_affiliate_orders
  where (p_shop_id is null or shop_id = p_shop_id)
    and (p_start is null or order_date >= p_start)
    and (p_end is null or order_date <= p_end)
    and creator_username is not null and creator_username <> '';
$function$


-- ===== koc_owes_clip_brands =====
CREATE OR REPLACE FUNCTION public.koc_owes_clip_brands(p_channel text)
 RETURNS TABLE(brand_norm text, brand_name text, last_order date, staff_name text, days_over integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
  with a as (
    select a.brand_name, a.staff_name, a.last_order_at, cbs.shop_id
    from koc_brand_assignments a
    join cast_brand_shop cbs on cbs.brand = a.brand_name
    where lower(regexp_replace(a.koc_id,'^@','')) = lower(regexp_replace(p_channel,'^@',''))
      and a.status = 'approved' and a.last_order_at is not null
  )
  select
    case when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'HEALMI%'
         then 'HEALMI' else upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) end as brand_norm,
    a.brand_name, a.last_order_at, a.staff_name, (current_date - a.last_order_at)::int as days_over
  from a
  where not exists (
    select 1 from koc_video_unit v
    where v.uname = lower(regexp_replace(p_channel,'^@',''))
      and v.shop_id = a.shop_id and v.post_eff >= a.last_order_at
  );
$function$


-- ===== koc_payment_brand_audit =====
CREATE OR REPLACE FUNCTION public.koc_payment_brand_audit()
 RETURNS TABLE(pay_id uuid, staff text, full_name text, pay_date date, brand_typed text, video_id text, link_shop text, typed_shop text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
  with rows as (
    select kp.id as pay_id, kp.staff, kp.full_name, kp.pay_date, upper(coalesce(kp.brand,'')) as brand_typed,
      m[1] as video_id
    from koc_payments kp, lateral regexp_matches(kp.air_link, '/video/(\\d{6,})', 'g') as m
    where coalesce(kp.air_link,'') <> '' and coalesce(kp.cast_net,0) > 0
      and coalesce(trim(kp.staff),'') <> ''   -- BỎ QUA đơn không ghi tên nhân sự (khỏi cần sửa)
  ),
  pay_vids as (select distinct video_id from rows),
  vid_shops as (
    select pv.video_id, v.shop_id from pay_vids pv join tiktok_shop_videos v on v.id = pv.video_id
    union
    select pv.video_id, o.shop_id from pay_vids pv
      join tiktok_affiliate_orders o on o.content_id = pv.video_id and o.content_type = 'VIDEO'
  ),
  shop_base as (select shop_id, regexp_replace(upper(brand), '\\s*(VN|HCM)\\s*$', '') as base from cast_brand_shop),
  vid_base as (select distinct vs.video_id, sb.base from vid_shops vs join shop_base sb on sb.shop_id = vs.shop_id),
  typed as (
    select distinct r.pay_id, r.staff, r.full_name, r.pay_date, r.brand_typed, r.video_id,
      bs.shop_id as typed_shop_id, regexp_replace(r.brand_typed, '\\s*(VN|HCM)\\s*$', '') as typed_base
    from rows r left join cast_brand_shop bs on bs.brand = r.brand_typed
  ),
  pay_typed as (select distinct pay_id, typed_base from typed where typed_shop_id is not null and coalesce(typed_base,'') <> ''),
  pay_brands as (select distinct t.pay_id, vb.base from typed t join vid_base vb on vb.video_id = t.video_id),
  bad_pay as (
    select pt.pay_id, pt.typed_base from pay_typed pt
    where exists (select 1 from pay_brands pb where pb.pay_id = pt.pay_id)
      and not exists (select 1 from pay_brands pb where pb.pay_id = pt.pay_id and pb.base = pt.typed_base)
  )
  select t.pay_id, t.staff, t.full_name, t.pay_date, t.brand_typed, t.video_id,
    (select string_agg(distinct coalesce(sc.seller_name, vs.shop_id), ', ')
       from vid_shops vs left join tiktok_shop_connections sc on sc.shop_id = vs.shop_id
       where vs.video_id = t.video_id) as link_shop,
    (select seller_name from tiktok_shop_connections where shop_id = t.typed_shop_id) as typed_shop,
    'SAI_BRAND'::text as status
  from typed t
  join bad_pay bp on bp.pay_id = t.pay_id
  where exists (select 1 from vid_base vb where vb.video_id = t.video_id and vb.base <> bp.typed_base);
$function$


-- ===== koc_payment_video_shops =====
CREATE OR REPLACE FUNCTION public.koc_payment_video_shops(p_ids text[])
 RETURNS TABLE(content_id text, shops text[])
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '20s'
AS $function$
  with vv as (
    select id as cid, shop_id from tiktok_shop_videos where id = any(p_ids)
    union
    select content_id as cid, shop_id from tiktok_affiliate_orders
      where content_id = any(p_ids) and coalesce(content_id,'') <> ''
  )
  select cid, array_agg(distinct shop_id) as shops
  from vv where shop_id is not null group by cid;
$function$


-- ===== koc_perf_extra_totals =====
CREATE OR REPLACE FUNCTION public.koc_perf_extra_totals(p_shop_id text, p_start date, p_end date, p_cast_start date, p_cast_end date, p_brand text DEFAULT NULL::text)
 RETURNS TABLE(vtotal bigint, vperiod bigint, cast_total numeric, sample_total numeric, vtotal_all bigint, vperiod_all bigint)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '40s'
AS $function$
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
$function$


-- ===== koc_phone_channel_warnings =====
CREATE OR REPLACE FUNCTION public.koc_phone_channel_warnings()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '15s'
AS $function$
  with base as (
    select nullif(trim(koc_id_kenh),'') as id_kenh, nullif(trim(koc_sdt),'') as sdt
    from donguis
    where nullif(trim(koc_id_kenh),'') is not null
      and trim(koc_sdt) ~ '^[0-9]{9,12}$'   -- chỉ tính giá trị THẬT là số điện thoại, bỏ qua \"HỦY ĐƠN\"...
  ),
  kenh_nhieu_sdt as (
    select id_kenh, count(distinct sdt) as so_sdt, array_agg(distinct sdt) as ds_sdt
    from base group by id_kenh having count(distinct sdt) >= 3
  ),
  sdt_nhieu_kenh as (
    select sdt, count(distinct id_kenh) as so_kenh, array_agg(distinct id_kenh) as ds_kenh
    from base group by sdt having count(distinct id_kenh) >= 3
  )
  select jsonb_build_object(
    'kenh_nhieu_sdt', coalesce((select jsonb_agg(jsonb_build_object('id_kenh', id_kenh, 'so_sdt', so_sdt, 'ds_sdt', ds_sdt) order by so_sdt desc) from kenh_nhieu_sdt), '[]'::jsonb),
    'sdt_nhieu_kenh', coalesce((select jsonb_agg(jsonb_build_object('sdt', sdt, 'so_kenh', so_kenh, 'ds_kenh', ds_kenh) order by so_kenh desc) from sdt_nhieu_kenh), '[]'::jsonb)
  );
$function$


-- ===== koc_product_breakdown =====
CREATE OR REPLACE FUNCTION public.koc_product_breakdown(p_shop_id text, p_start date, p_end date, p_creator text)
 RETURNS TABLE(product_id text, orders bigint, gmv numeric, qty bigint, videos bigint, content_types text)
 LANGUAGE sql
 STABLE
AS $function$
  select product_id,
    count(distinct order_id) as orders,
    coalesce(sum(price_amount * quantity), 0) as gmv,
    coalesce(sum(quantity), 0) as qty,
    count(distinct content_id) filter (where content_type = 'VIDEO' and content_id <> '') as videos,
    string_agg(distinct content_type, ',') as content_types
  from tiktok_affiliate_orders
  where (p_shop_id is null or shop_id = p_shop_id)
    and (p_start is null or order_date >= p_start)
    and (p_end is null or order_date <= p_end)
    and creator_username = p_creator
    and product_id <> ''
  group by product_id
  order by gmv desc;
$function$


-- ===== koc_product_video_counts =====
CREATE OR REPLACE FUNCTION public.koc_product_video_counts(p_shop_id text, p_creator text, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS TABLE(product_id text, v_total bigint, v_period bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select v.product_id,
    count(distinct v.id) as v_total,
    count(distinct v.id) filter (where v.post_date is not null
      and (p_start is null or v.post_date >= p_start)
      and (p_end   is null or v.post_date <= p_end)) as v_period
  from tiktok_shop_videos v
  where v.shop_id = p_shop_id and lower(v.username) = lower(p_creator) and coalesce(v.product_id,'') <> ''
  group by v.product_id;
$function$


-- ===== koc_purge_blacklist_assignments =====
CREATE OR REPLACE FUNCTION public.koc_purge_blacklist_assignments(p_actor text DEFAULT 'auto'::text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare n int;
begin
  with bl as (select distinct lower(regexp_replace(coalesce(id_kenh,''),'^@','')) as ch from koc_blacklist),
  del as (
    delete from koc_brand_assignments a
    where lower(regexp_replace(coalesce(a.koc_id,''),'^@','')) in (select ch from bl where ch <> '')
    returning a.koc_id, a.brand_name, a.staff_name
  )
  insert into koc_assignment_history(koc_id, brand_name, staff_name, action, actor)
  select koc_id, brand_name, staff_name, 'remove', p_actor || ' (blacklist auto)' from del;
  get diagnostics n = row_count;
  return n;
end $function$


-- ===== koc_remove_assignment =====
CREATE OR REPLACE FUNCTION public.koc_remove_assignment(p_koc text, p_brand text, p_actor text DEFAULT 'admin'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int; v_canon text;
begin
  v_canon := case
    when upper(regexp_replace(coalesce(p_brand,''),'[^A-Za-z0-9]','','g')) like 'EHERB%' and upper(regexp_replace(coalesce(p_brand,''),'[^A-Za-z0-9]','','g')) like '%HCM%' then 'EHERB HCM'
    when upper(regexp_replace(coalesce(p_brand,''),'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
    when upper(regexp_replace(coalesce(p_brand,''),'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
    when upper(regexp_replace(coalesce(p_brand,''),'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
    else upper(regexp_replace(coalesce(p_brand,''),'[^A-Za-z0-9]','','g')) end;
  with del as (
    delete from koc_brand_assignments
    where lower(regexp_replace(coalesce(koc_id,''),'^@','')) = lower(regexp_replace(coalesce(p_koc,''),'^@',''))
      and (case
        when upper(regexp_replace(coalesce(brand_name,''),'[^A-Za-z0-9]','','g')) like 'EHERB%' and upper(regexp_replace(coalesce(brand_name,''),'[^A-Za-z0-9]','','g')) like '%HCM%' then 'EHERB HCM'
        when upper(regexp_replace(coalesce(brand_name,''),'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
        when upper(regexp_replace(coalesce(brand_name,''),'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
        when upper(regexp_replace(coalesce(brand_name,''),'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
        else upper(regexp_replace(coalesce(brand_name,''),'[^A-Za-z0-9]','','g')) end) = v_canon
    returning koc_id, brand_name, staff_name, coalesce(approved_at, assigned_at)::date as tag_since
  )
  insert into koc_assignment_history(koc_id, brand_name, staff_name, action, actor, tag_since)
  select koc_id, brand_name, staff_name, 'remove', p_actor, tag_since from del;
  get diagnostics n = row_count;
  return n;
end $function$


-- ===== koc_sample_cost =====
CREATE OR REPLACE FUNCTION public.koc_sample_cost(p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_brand text DEFAULT NULL::text)
 RETURNS TABLE(uname text, sample_cost numeric)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '20s'
AS $function$
  with latest_col as (
    select h as col from costing_data, jsonb_array_elements_text(headers) h
    where h like 'COSTING T% AMIS V2'
    order by (regexp_match(h, 'T(\\d+)\\.(\\d+) AMIS V2'))[2]::int desc,
             (regexp_match(h, 'T(\\d+)\\.(\\d+) AMIS V2'))[1]::int desc
    limit 1
  ),
  cost_map as (
    select regexp_replace(r->>'Mã', '\\s', '', 'g') as barcode,
           case when trim(replace((r->>lc.col), ',', '')) ~ '^[0-9]+(\\.[0-9]+)?$'
                then trim(replace((r->>lc.col), ',', ''))::numeric else null end as cost
    from costing_data cd, latest_col lc, jsonb_array_elements(cd.rows) r
    where cd.key = 'latest'
  ),
  per_order as (
    select d.id, lower(d.koc_id_kenh) as uname, d.loai_ship,
           sum(coalesce(cm.cost, 0) * 1.08 * coalesce(ct.so_luong, 0)) as items_cost
    from donguis d
    join chitiettonguis ct on ct.dongui_id = d.id
    join sanphams sp on sp.id = ct.sanpham_id
    left join brands b on b.id = sp.brand_id
    left join cost_map cm on cm.barcode = regexp_replace(coalesce(sp.barcode,''), '\\s', '', 'g')
    where coalesce(d.koc_id_kenh, '') <> ''
      and (p_start is null or (d.ngay_gui at time zone 'Asia/Ho_Chi_Minh')::date >= p_start)
      and (p_end   is null or (d.ngay_gui at time zone 'Asia/Ho_Chi_Minh')::date <= p_end)
      and (p_brand is null or
           upper(regexp_replace(regexp_replace(coalesce(b.ten_brand,''),'\\s*HCM\\s*$','','i'),'[^A-Za-z0-9]','','g'))
         = upper(regexp_replace(regexp_replace(p_brand,'\\s*HCM\\s*$','','i'),'[^A-Za-z0-9]','','g')))
    group by d.id, lower(d.koc_id_kenh), d.loai_ship
  )
  select uname,
         round(sum(items_cost + 5000 + case when loai_ship = 'Hỏa tốc' then 50000 else 20000 end))::numeric as sample_cost
  from per_order
  group by uname;
$function$


-- ===== koc_video_breakdown =====
CREATE OR REPLACE FUNCTION public.koc_video_breakdown(p_shop_id text, p_start date, p_end date, p_creator text)
 RETURNS TABLE(content_id text, content_type text, first_order bigint, last_order bigint, orders bigint, gmv numeric, qty bigint, top_product_id text, product_count bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select content_id,
    max(content_type) as content_type,
    min(create_time) as first_order,
    max(create_time) as last_order,
    count(distinct order_id) as orders,
    coalesce(sum(price_amount * quantity), 0) as gmv,
    coalesce(sum(quantity), 0) as qty,
    (array_agg(product_id order by price_amount * quantity desc))[1] as top_product_id,
    count(distinct product_id) filter (where product_id <> '') as product_count
  from tiktok_affiliate_orders
  where (p_shop_id is null or shop_id = p_shop_id)
    and (p_start is null or order_date >= p_start)
    and (p_end is null or order_date <= p_end)
    and creator_username = p_creator
    and content_id <> ''
  group by content_id
  order by first_order desc;
$function$


-- ===== koc_video_cast =====
CREATE OR REPLACE FUNCTION public.koc_video_cast(p_shop_id text, p_creator text)
 RETURNS TABLE(content_id text, cast_amount numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with creator_vids as (
    select distinct content_id from tiktok_affiliate_orders
    where shop_id = p_shop_id and lower(creator_username) = lower(p_creator) and coalesce(content_id,'') <> ''
  )
  select cv.content_id, vc.cast_amount
  from creator_vids cv
  join v_video_cast vc on vc.content_id = cv.content_id
  where vc.cast_amount is not null;
$function$


-- ===== koc_video_counts =====
CREATE OR REPLACE FUNCTION public.koc_video_counts(p_shop_id text, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS TABLE(username text, v_total bigint, v_period bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select v.username,
    count(distinct v.id) as v_total,
    count(distinct v.id) filter (where v.post_date is not null
      and (p_start is null or v.post_date >= p_start)
      and (p_end   is null or v.post_date <= p_end)) as v_period
  from tiktok_shop_videos v
  where v.shop_id = p_shop_id and coalesce(v.username,'') <> ''
  group by v.username;
$function$


-- ===== koc_video_views =====
CREATE OR REPLACE FUNCTION public.koc_video_views(p_shop_id text, p_start date, p_end date)
 RETURNS TABLE(uname text, total_views bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ff as (select (p_shop_id is not null and exists(select 1 from koc_full_video_shops f where f.shop_id=p_shop_id)) as full_on),
  months as (
    select to_char(gs,'YYYY-MM') ym
    from generate_series(date_trunc('month',coalesce(p_start,date '2026-01-01')),
                         date_trunc('month',coalesce(p_end,current_date)), interval '1 month') gs
  ),
  ord_creators as (   -- creator CÓ ĐƠN trong kỳ (đúng tập hiển thị, bounded)
    select distinct lower(regexp_replace(creator_username,'^@','')) as uname
    from tiktok_affiliate_orders
    where (p_shop_id is null or shop_id=p_shop_id) and coalesce(creator_username,'')<>''
      and (p_start is null or order_date>=p_start) and (p_end is null or order_date<=p_end)
  ),
  full_v as (   -- gian full: đếm view TẤT CẢ video của creator-có-đơn (theo username)
    select lower(regexp_replace(v.username,'^@','')) as uname, coalesce(sum(mv.views),0)::bigint as total_views
    from tiktok_shop_videos v
    join tiktok_video_monthly_views mv on mv.id = v.id and mv.ym in (select ym from months)
    where v.shop_id = p_shop_id and coalesce(v.username,'') <> ''
      and lower(regexp_replace(v.username,'^@','')) in (select uname from ord_creators)
    group by 1
  ),
  norm_vids as (   -- gian khác: chỉ video có đơn
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
$function$


-- ===== koc_video_views_total =====
CREATE OR REPLACE FUNCTION public.koc_video_views_total(p_shop_id text, p_start date, p_end date)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET statement_timeout TO '20s'
 SET search_path TO 'public'
AS $function$
  with months as (
    select to_char(gs,'YYYY-MM') ym
    from generate_series(date_trunc('month', coalesce(p_start, date '2026-01-01')),
                         date_trunc('month', coalesce(p_end, current_date)), interval '1 month') gs
  )
  select coalesce(sum(views),0)::bigint
  from tiktok_video_monthly_views
  where (p_shop_id is null or shop_id = p_shop_id) and ym in (select ym from months);
$function$


-- ===== koc_views_to_fill =====
CREATE OR REPLACE FUNCTION public.koc_views_to_fill(p_shop_id text, p_limit integer DEFAULT 40)
 RETURNS TABLE(video_id text, ym text, username text)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '25s'
AS $function$
  with bm(brand_name, shop_id) as (values
    ('BODYMISS','7495107349171898427'), ('REAL STEEL','7496180170889726491'),
    ('EHERB','7494529979361168222'),
    ('EHERB HCM','7495838925500090511'), ('MILAGANICS','7494813818973817115'),
    ('MOAW MOAWS','7495831977917385095'), ('HEALMI','7494251668499498533')),
  order_src as (
    select content_id as vid, max(order_date)::date as ref_date,
           to_char(order_date, 'YYYY-MM') as ym, max(creator_username) as uname
    from tiktok_affiliate_orders
    where shop_id = p_shop_id and content_type = 'VIDEO' and coalesce(content_id,'') <> '' and order_date >= date '2026-01-01'
    group by content_id, to_char(order_date, 'YYYY-MM')
  ),
  air_src as (
    select al.id_video as vid, max(al.ngay_air)::date as ref_date,
           to_char(al.ngay_air, 'YYYY-MM') as ym, ''::text as uname
    from air_links al join brands b on b.id = al.brand_id join bm on bm.brand_name = b.ten_brand
    where bm.shop_id = p_shop_id and al.id_video ~ '^[0-9]+$'
      and al.ngay_air >= date '2026-01-01' and al.ngay_air <= date '2026-12-31'
    group by al.id_video, to_char(al.ngay_air, 'YYYY-MM')
  ),
  -- NGUỒN MỚI: video air/có đơn trong 60 ngày → đòi dòng view THÁNG HIỆN TẠI (view phát sinh tiếp)
  cur_src as (
    select vid, ref_date, to_char(current_date, 'YYYY-MM') as ym, uname
    from (select * from order_src union all select * from air_src) z
    where ref_date >= current_date - 60
  ),
  src as (
    select vid, ym, max(ref_date) as ref_date, max(uname) as uname
    from (select * from order_src union all select * from air_src union all select * from cur_src) z
    group by vid, ym
  )
  select s.vid, s.ym, s.uname
  from src s
  where not exists (select 1 from tiktok_video_monthly_views mv where mv.id = s.vid and mv.ym = s.ym)
  order by s.ref_date desc, s.ym desc
  limit greatest(1, least(p_limit, 80));
$function$


-- ===== product_cost_amis =====
CREATE OR REPLACE FUNCTION public.product_cost_amis()
 RETURNS TABLE(barcode text, cost numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
  with latest_col as (
    select h as col from costing_data, jsonb_array_elements_text(headers) h where h like 'COSTING T% AMIS V2'
    order by (regexp_match(h,'T(\\d+)\\.(\\d+) AMIS V2'))[2]::int desc,(regexp_match(h,'T(\\d+)\\.(\\d+) AMIS V2'))[1]::int desc limit 1)
  select regexp_replace(r->>'Mã','\\s','','g') as barcode,
      max(case when trim(replace((r->>lc.col),',',''))~'^[0-9]+(\\.[0-9]+)?$' then trim(replace((r->>lc.col),',',''))::numeric else null end) as cost
  from costing_data cd, latest_col lc, jsonb_array_elements(cd.rows) r where cd.key='latest'
  group by 1;
$function$


-- ===== promo_check_orders =====
CREATE OR REPLACE FUNCTION public.promo_check_orders(p_from date, p_to date)
 RETURNS TABLE(order_key text, order_sn text, shop_name text, buyer text, order_date date, rule_id uuid, rule_name text, discount_desc text, item_name text, qty integer, price numeric, orig numeric, status text, note text, handled_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '60s'
AS $function$
  with rules as (
    select * from promo_rules where active = true and platform in ('shopee','both')
  ),
  ords as (
    select o.order_sn, o.shop_name, o.buyer_username, o.create_time,
      jsonb_array_elements((o.items #>> '{}')::jsonb) as item
    from shopee_orders o
    where o.items is not null and jsonb_typeof(o.items) = 'string'
      and to_timestamp(o.create_time)::date between p_from and p_to
  ),
  hits as (
    select 'shopee|' || o.order_sn as order_key, o.order_sn, o.shop_name,
      o.buyer_username as buyer, to_timestamp(o.create_time)::date as order_date,
      r.id as rule_id, r.name as rule_name, r.discount_desc,
      o.item->>'item_name' as item_name,
      (o.item->>'qty')::int as qty,
      (o.item->>'price')::numeric as price,
      (o.item->>'original_price')::numeric as orig
    from ords o
    join rules r
      on (o.item->>'item_name') ilike '%' || r.keyword || '%'
     and (o.item->>'qty')::int >= r.min_qty
     and (o.item->>'price')::numeric >= (o.item->>'original_price')::numeric
     and (o.item->>'original_price')::numeric > 0
     and (r.date_from is null or to_timestamp(o.create_time)::date >= r.date_from)
     and (r.date_to   is null or to_timestamp(o.create_time)::date <= r.date_to)
  )
  select h.order_key, h.order_sn, h.shop_name, h.buyer, h.order_date,
    h.rule_id, h.rule_name, h.discount_desc, h.item_name, h.qty, h.price, h.orig,
    coalesce(s.status, 'pending') as status, s.note, s.handled_at
  from hits h
  left join promo_order_status s on s.order_key = h.order_key
  order by h.order_date desc;
$function$


-- ===== report_booking_cast =====
CREATE OR REPLACE FUNCTION public.report_booking_cast(p_from date, p_to date)
 RETURNS TABLE(brand_canon text, cast_net numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
  with pay as (
    select kp.brand, kp.cast_net, kp.air_date_manual, kp.pay_date,
           nullif(substring(kp.air_link from 'video/([0-9]+)'), '') as vid
    from koc_payments kp where coalesce(kp.cast_net,0) <> 0
  ),
  res as (
    select case
        when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
        when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
        when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
        else upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g'))
      end as brand_canon,
      p.cast_net,
      coalesce(p.air_date_manual, vd.post_date, p.pay_date) as air_dt
    from pay p
    left join lateral (select max(post_date) as post_date from tiktok_shop_videos where id = p.vid) vd on true
  )
  select brand_canon, sum(cast_net)::numeric
  from res where air_dt is not null and air_dt >= p_from and air_dt <= p_to
  group by brand_canon;
$function$


-- ===== report_booking_cast_kocs =====
CREATE OR REPLACE FUNCTION public.report_booking_cast_kocs(p_from date, p_to date)
 RETURNS TABLE(brand_canon text, koc text, full_name text, cast_net numeric, n bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
  with pay as (
    select kp.brand, kp.cast_net, kp.air_date_manual, kp.pay_date, kp.full_name,
           lower(coalesce(substring(kp.channel_link from '@([^/?#]+)'), kp.channel_link)) as koc,
           nullif(substring(kp.air_link from 'video/([0-9]+)'), '') as vid
    from koc_payments kp where coalesce(kp.cast_net,0) <> 0
  ),
  res as (
    select case
        when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
        when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
        when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
        else upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g'))
      end as brand_canon, p.koc, p.full_name, p.cast_net,
      coalesce(p.air_date_manual, vd.post_date, p.pay_date) as air_dt
    from pay p left join lateral (select max(post_date) as post_date from tiktok_shop_videos where id = p.vid) vd on true
  )
  select brand_canon, koc, max(full_name), sum(cast_net)::numeric, count(*)::bigint
  from res where air_dt is not null and air_dt >= p_from and air_dt <= p_to and coalesce(koc,'')<>''
  group by brand_canon, koc order by sum(cast_net) desc;
$function$


-- ===== report_cs_auto =====
CREATE OR REPLACE FUNCTION public.report_cs_auto(p_brand text, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
with map(brand, sp_shop_id, tt_shop_id) as (values
  ('Bodymiss','1031859035','7495107349171898427'),
  ('Milaganics','1243148826','7494813818973817115'),
  ('Moaw Moaws','1017289279','7495831977917385095'),
  ('eHerb','341325550','7494529979361168222'),
  ('eHerb HCM','831509831','7495838925500090511'),
  ('Real Steel', null,'7496180170889726491'),
  ('Masube','1616999364', null),
  ('Healmi', null,'7494251668499498533')
),
m as (select * from map where brand = p_brand),
sp as (
  select count(*)::numeric as tong,
         count(*) filter (where o.order_status in ('CANCELLED','IN_CANCEL'))::numeric as huy,
         count(*) filter (where o.order_status = 'TO_RETURN')::numeric as tra
  from shopee_orders o, m
  where o.shop_id = m.sp_shop_id and to_timestamp(o.create_time)::date between p_from and p_to
),
tt as (
  select count(distinct o.order_id)::numeric as tong,
         count(distinct o.order_id) filter (where o.fully_return = 'Yes')::numeric as tra
  from tiktok_affiliate_orders o, m
  where o.shop_id = m.tt_shop_id and o.order_date between p_from and p_to
)
select jsonb_build_object(
  'brand', p_brand, 'from', p_from, 'to', p_to,
  'shopee', (select jsonb_build_object(
      'tong_don', tong,
      'sp_huy_don', case when tong>0 then round(100*huy/tong,2) end,
      'sp_tra_hang_hoan_tien', case when tong>0 then round(100*tra/tong,2) end,
      'sp_don_hang_khong_tc', case when tong>0 then round(100*(huy+tra)/tong,2) end) from sp),
  'tiktok', (select jsonb_build_object(
      'tong_don', tong,
      'tt_tra_hang_hoan_tien', case when tong>0 then round(100*tra/tong,2) end) from tt)
);
$function$


-- ===== report_sample_cost =====
CREATE OR REPLACE FUNCTION public.report_sample_cost(p_brand_ids uuid[], p_from date, p_to date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
  with latest_col as (
    select h as col from costing_data, jsonb_array_elements_text(headers) h where h like 'COSTING T% AMIS V2'
    order by (regexp_match(h,'T(\\d+)\\.(\\d+) AMIS V2'))[2]::int desc,(regexp_match(h,'T(\\d+)\\.(\\d+) AMIS V2'))[1]::int desc limit 1),
  cost_map as (
    select regexp_replace(r->>'Mã','\\s','','g') barcode,
      case when trim(replace((r->>lc.col),',',''))~'^[0-9]+(\\.[0-9]+)?$' then trim(replace((r->>lc.col),',',''))::numeric else null end cost
    from costing_data cd, latest_col lc, jsonb_array_elements(cd.rows) r where cd.key='latest'),
  per_order as (
    select d.id, d.loai_ship, sum(coalesce(cm.cost,0)*1.08*coalesce(ct.so_luong,0)) items_cost
    from donguis d join chitiettonguis ct on ct.dongui_id=d.id join sanphams sp on sp.id=ct.sanpham_id
    left join cost_map cm on cm.barcode = regexp_replace(coalesce(sp.barcode,''),'\\s','','g')
    where sp.brand_id = any(p_brand_ids) and d.trang_thai = 'Đã đóng đơn'
      and (d.ngay_gui at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
    group by d.id, d.loai_ship)
  select coalesce(sum(items_cost + 5000 + case when loai_ship='Hỏa tốc' then 50000 else 20000 end),0)::numeric from per_order;
$function$


-- ===== resync_koc_order_tags =====
CREATE OR REPLACE FUNCTION public.resync_koc_order_tags(p_channel text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_removed int := 0; uname text;
begin
  uname := lower(regexp_replace(coalesce(p_channel,''),'^@',''));
  if uname = '' then return 0; end if;

  create temp table _lo on commit drop as
  select a.koc_id, a.brand_name, a.approved_by,
    (select max(cbs.shop_id) from cast_brand_shop cbs where cbs.brand = a.brand_name) as shop_id,
    (select max(d.ngay_gui::date)
       from donguis d
       join chitiettonguis ct on ct.dongui_id = d.id
       join sanphams sp on sp.id = ct.sanpham_id
       join brands b on b.id = sp.brand_id
      where lower(regexp_replace(coalesce(d.koc_id_kenh,''),'^@','')) = a.koc_id
        and (case b.ten_brand when 'HEALMI' then 'HEALMII' else b.ten_brand end) = a.brand_name
        and d.ngay_gui > coalesce(
          (select max(h.created_at) from koc_assignment_history h
            where h.koc_id = a.koc_id and h.brand_name = a.brand_name and h.action = 'remove'),
          '1970-01-01'::timestamptz)
    ) as last_order
  from koc_brand_assignments a
  where a.koc_id = uname;

  -- (1) còn đơn tenure -> chỉnh last_order_at cho đúng (rollback)
  update koc_brand_assignments a
  set last_order_at = lo.last_order, updated_at = now()
  from _lo lo
  where a.koc_id = lo.koc_id and a.brand_name = lo.brand_name
    and lo.last_order is not null and a.last_order_at is distinct from lo.last_order;

  -- (2a) hết đơn tenure + auto-order + chưa air -> GỠ tag mồ côi (không log remove)
  with del as (
    delete from koc_brand_assignments a using _lo lo
    where a.koc_id = lo.koc_id and a.brand_name = lo.brand_name
      and lo.last_order is null and lo.approved_by = 'auto-order'
      and not exists (select 1 from koc_video_unit v where v.uname = lo.koc_id and v.shop_id = lo.shop_id)
    returning 1
  )
  select count(*) into v_removed from del;

  -- (2b) hết đơn tenure nhưng tag tay / đã air -> giữ tag, nhả khoá nợ clip
  update koc_brand_assignments a
  set last_order_at = null, updated_at = now()
  from _lo lo
  where a.koc_id = lo.koc_id and a.brand_name = lo.brand_name
    and lo.last_order is null and a.last_order_at is not null;

  return v_removed;
end $function$


-- ===== shopee_top_sellers =====
CREATE OR REPLACE FUNCTION public.shopee_top_sellers(p_days integer DEFAULT 30, p_limit integer DEFAULT 10, p_shop_id text DEFAULT NULL::text, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS TABLE(shop_id text, shop_name text, item_id text, item_name text, total_qty numeric, revenue numeric, rnk bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with bounds as (
    select
      case when p_start is not null and p_end is not null
        then extract(epoch from (p_start::timestamp at time zone 'Asia/Ho_Chi_Minh'))::bigint
        else extract(epoch from now())::bigint - greatest(p_days,1) * 86400
      end as lo,
      case when p_start is not null and p_end is not null
        then extract(epoch from ((p_end + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'))::bigint
        else extract(epoch from now())::bigint + 86400
      end as hi
  ),
  src as (
    select o.shop_id, o.shop_name, (o.items #>> '{}')::jsonb as arr
    from public.shopee_orders o, bounds b
    where o.items is not null
      and jsonb_typeof(o.items) = 'string'
      and o.create_time >= b.lo
      and o.create_time < b.hi
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
$function$


-- ===== staff_air_links =====
CREATE OR REPLACE FUNCTION public.staff_air_links(p_nhansu_id uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, link_air_koc text, id_kenh text, id_video text, ngay_air date, san_pham text, ten_brand text, status text, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
  with base as (
    select a.id, a.link_air_koc, a.id_kenh, a.id_video, a.ngay_air, a.san_pham,
      coalesce(b.ten_brand,'') as ten_brand,
      case when a.ngay_air is not null and a.ngay_air <= current_date then 'Đã On-air' else 'Chưa air' end as status
    from air_links a left join brands b on b.id = a.brand_id
    where a.nhansu_id = p_nhansu_id
      and (coalesce(p_search,'')=''
           or lower(coalesce(a.id_kenh,'')) like '%'||lower(p_search)||'%'
           or coalesce(a.id_video,'') like '%'||p_search||'%'
           or lower(coalesce(a.san_pham,'')) like '%'||lower(p_search)||'%'
           or lower(coalesce(b.ten_brand,'')) like '%'||lower(p_search)||'%'))
  select id, link_air_koc, id_kenh, id_video, ngay_air, san_pham, ten_brand, status, count(*) over() as total
  from base order by ngay_air desc nulls last limit greatest(p_limit,1) offset greatest(p_offset,0);
$function$


-- ===== staff_all_records =====
CREATE OR REPLACE FUNCTION public.staff_all_records(p_nhansu_id uuid, p_from date, p_to date, p_loai text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(loai text, koc text, brand text, san_pham text, link text, ngay_air date, cast_amount numeric, view_ky numeric, gmv_ky numeric, trang_thai text, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
  with months as (select to_char(gs,'YYYY-MM') ym from generate_series(date_trunc('month',p_from::timestamp), date_trunc('month',p_to::timestamp), interval '1 month') gs),
  me as (select lower(trim(ten_nhansu)) nm from nhansu where id=p_nhansu_id),
  q as (select nullif(trim(coalesce(p_search,'')),'') as s,
               (regexp_match(coalesce(p_search,''), '/video/(\\d{6,})'))[1] as vid_in_link),
  -- CAST THẬT lấy từ FILE THANH TOÁN (koc_payments) theo ID video trong air_link
  pay as (
    select (m.mm)[1] as vid,
      max(lower(regexp_replace(coalesce((regexp_match(p.channel_link,'@([^/?#]+)'))[1],''),'^@',''))) as koc_u,
      max(coalesce(p.brand,'')) as brand,
      max(p.pay_date) as pay_date,
      sum(coalesce(p.cast_net,0)) as cast_amt
    from koc_payments p, lateral regexp_matches(coalesce(p.air_link,''), '/video/(\\d{6,})', 'g') m(mm)
    where lower(trim(p.staff)) = (select nm from me) and coalesce(p.cast_net,0) > 0
    group by 1
  ),
  air as (
    select 'air'::text as loai,
      '@'||lower(regexp_replace(coalesce(a.id_kenh,''),'^@','')) as koc, coalesce(b.ten_brand,'') as brand,
      a.san_pham, a.link_air_koc as link, a.ngay_air, coalesce(a.id_video,'') as vid,
      -- cast = LỚN HƠN giữa ô gõ tay và tiền trong file thanh toán
      greatest(
        coalesce(nullif(regexp_replace(coalesce(a.\"cast\",''),'[^0-9]','','g'),''),'0')::numeric,
        coalesce((select pp.cast_amt from pay pp where pp.vid = coalesce(a.id_video,'')),0)
      ) as cast_amount,
      case when a.ngay_air is not null and a.ngay_air <= current_date then 'Đã On-air' else 'Chưa air' end as trang_thai
    from air_links a left join brands b on b.id = a.brand_id
    where a.nhansu_id = p_nhansu_id
  ),
  tg as (select content_id, kenh, brand, air_date, view_period, gmv_period from staff_tenure_videos(p_nhansu_id, p_from, p_to)),
  -- Video ĐÃ TRẢ CAST nhưng CHƯA có link air (và chưa nằm ở video-theo-tag) -> vẫn phải hiện
  pay_only as (
    select 'pay'::text loai, '@'||pp.koc_u koc, pp.brand, null::text san_pham,
      'https://www.tiktok.com/@'||pp.koc_u||'/video/'||pp.vid as link,
      coalesce((select min(x.d) from (
          select min(o.order_date)::date d from tiktok_affiliate_orders o where o.content_id = pp.vid
          union all select v.post_date from tiktok_shop_videos v where v.id = pp.vid) x), pp.pay_date) as ngay_air,
      pp.vid, pp.cast_amt as cast_amount, 'Đã On-air'::text trang_thai
    from pay pp
    where not exists (select 1 from air_links a2 where a2.nhansu_id = p_nhansu_id and coalesce(a2.id_video,'') = pp.vid)
      and not exists (select 1 from tg where tg.content_id = pp.vid)
  ),
  base as (
    select loai, koc, brand, san_pham, link, ngay_air, vid, cast_amount, trang_thai from air
    union all
    select 'tag', tg.kenh, tg.brand, null::text, 'https://www.tiktok.com/'||tg.kenh||'/video/'||tg.content_id,
           tg.air_date, tg.content_id, coalesce(pp.cast_amt,0), 'Đã On-air'
      from tg left join pay pp on pp.vid = tg.content_id
    union all
    select loai, koc, brand, san_pham, link, ngay_air, vid, cast_amount, trang_thai from pay_only
  ),
  filtered as (
    select b.* from base b, q
    where (coalesce(p_loai,'') = ''
           or (p_loai = 'cast' and b.cast_amount > 0)
           or (p_loai <> 'cast' and b.loai = p_loai))
      and (q.s is null
           or lower(b.koc) like '%'||lower(q.s)||'%'
           or lower(coalesce(b.brand,'')) like '%'||lower(q.s)||'%'
           or lower(coalesce(b.san_pham,'')) like '%'||lower(q.s)||'%'
           or b.vid like '%'||q.s||'%'
           or lower(coalesce(b.link,'')) like '%'||lower(q.s)||'%'
           or (q.vid_in_link is not null and b.vid = q.vid_in_link))
  ),
  page as (select * from filtered order by ngay_air desc nulls last, koc limit greatest(p_limit,1) offset greatest(p_offset,0))
  select p.loai, p.koc, p.brand, p.san_pham, p.link, p.ngay_air, p.cast_amount,
    coalesce((select sum(mv.views) from tiktok_video_monthly_views mv where mv.id = p.vid and mv.ym in (select ym from months)),0)::numeric,
    coalesce((select sum(o.price_amount*o.quantity) from tiktok_affiliate_orders o where o.content_id = p.vid and o.order_date >= p_from and o.order_date <= p_to),0)::numeric,
    p.trang_thai,
    (select count(*) from filtered)::bigint
  from page p;
$function$


-- ===== staff_booking_detail =====
CREATE OR REPLACE FUNCTION public.staff_booking_detail(p_nhansu_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '40s'
 SET work_mem TO '256MB'
AS $function$
  with rng as (select p_from::timestamptz as ts0, (p_to + 1)::timestamptz as ts1, p_from as d0, p_to as d1),
  months as (select to_char(gs,'YYYY-MM') ym from rng, generate_series(date_trunc('month', rng.d0), date_trunc('month', rng.d1), interval '1 month') gs),
  me as (select ten_nhansu from nhansu where id=p_nhansu_id),
  brand_map(brand_canon, shop_id) as (values
    ('BODYMISS','7495107349171898427'),('REALSTEEL','7496180170889726491'),('EHERB','7494529979361168222'),
    ('EHERB HCM','7495838925500090511'),('MILAGANICS','7494813818973817115'),('MOAW','7495831977917385095'),('HEALMI','7494251668499498533')),
  cur as (select lower(regexp_replace(a.koc_id,'^@','')) uname,
      case when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' and upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like '%HCM%' then 'EHERB HCM'
           when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
           when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
           when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
           else upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) end as brand_canon,
      coalesce(a.approved_at,a.assigned_at)::date start_d
    from koc_brand_assignments a join nhansu n on lower(trim(n.ten_nhansu))=lower(trim(a.staff_name))
    where n.id=p_nhansu_id and a.status='approved'),
  own_start as (select lower(regexp_replace(koc_id,'^@','')) uname,
      case when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' and upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like '%HCM%' then 'EHERB HCM'
           when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
           when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
           when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
           else upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) end brand_canon, min(created_at::date) s
    from koc_assignment_history where action in ('approve','assign') and lower(trim(staff_name))=lower(trim((select ten_nhansu from me))) group by 1,2),
  past_raw as (select lower(regexp_replace(koc_id,'^@','')) uname,
      case when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' and upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like '%HCM%' then 'EHERB HCM'
           when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
           when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
           when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
           else upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) end brand_canon, max(created_at::date) end_d, min(tag_since) tag_since_rm
    from koc_assignment_history where action='remove' and not (actor ilike '%từ chối%' or actor ilike '%tu choi%') and lower(trim(staff_name))=lower(trim((select ten_nhansu from me))) group by 1,2),
  past as (select p.uname, p.brand_canon, p.end_d, coalesce(p.tag_since_rm, os.s) start_d
    from past_raw p left join own_start os on os.uname=p.uname and os.brand_canon=p.brand_canon
    where coalesce(p.tag_since_rm, os.s) is not null),
  tenure_c as (select uname, brand_canon, start_d, '2100-01-01'::date end_d from cur
    union all select uname, brand_canon, start_d, end_d from past),
  tenure as (select tc.uname, tc.brand_canon, bm.shop_id, tc.start_d, tc.end_d from tenure_c tc join brand_map bm on bm.brand_canon=tc.brand_canon),
  cast_p as (select lower((regexp_match(p.channel_link, '@([^/?#]+)'))[1]) as uname,
      case when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'EHERB%' and upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like '%HCM%' then 'EHERB HCM'
           when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
           when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
           when upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
           else upper(regexp_replace(coalesce(p.brand,''),'[^A-Za-z0-9]','','g')) end brand_canon, sum(p.cast_net) cast_amt
    from koc_payments p join nhansu n on lower(trim(n.ten_nhansu))=lower(trim(p.staff)), rng
    where n.id=p_nhansu_id and p.pay_date>=rng.d0 and p.pay_date<=rng.d1 and p.channel_link is not null and coalesce(p.cast_net,0)<>0 group by 1,2),
  air_v as (select a.id_video content_id, a.ngay_air post_eff from air_links a where a.nhansu_id=p_nhansu_id and coalesce(a.id_video,'')<>''),
  pay_v as (select (m.mm)[1] content_id from koc_payments p, lateral regexp_matches(coalesce(p.air_link,''),'/video/(\\d{6,})','g') m(mm)
    where lower(trim(p.staff))=lower(trim((select ten_nhansu from me))) and coalesce((m.mm)[1],'')<>''),
  days as (select gs::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') gs),
  d_ord as (select dg.ngay_gui::date d, count(distinct dg.id) don, coalesce(sum(ct.so_luong),0) mau
    from donguis dg left join chitiettonguis ct on ct.dongui_id=dg.id, rng where dg.nhansu_id=p_nhansu_id and dg.ngay_gui>=rng.ts0 and dg.ngay_gui<rng.ts1 group by dg.ngay_gui::date),
  vpool as (select v.uname, v.brand_canon, v.content_id, min(v.post_eff) post_eff from (
      select t.uname, t.brand_canon, o.content_id, min(o.order_date)::date post_eff
        from tenure t join tiktok_affiliate_orders o on o.shop_id=t.shop_id and lower(regexp_replace(o.creator_username,'^@',''))=t.uname
        where o.content_type='VIDEO' and coalesce(o.content_id,'')<>'' group by t.uname,t.brand_canon,o.content_id
      union all
      select t.uname, t.brand_canon, v.id, v.post_date from tenure t join tiktok_shop_videos v on v.shop_id=t.shop_id and lower(regexp_replace(coalesce(v.username,''),'^@',''))=t.uname
    ) v group by v.uname,v.brand_canon,v.content_id),
  vu_ok as (select vp.uname, vp.brand_canon, vp.content_id, vp.post_eff from vpool vp join tenure t on t.uname=vp.uname and t.brand_canon=vp.brand_canon
    where vp.post_eff is not null and vp.post_eff>=t.start_d and vp.post_eff<t.end_d),
  vf_day as (select content_id, min(post_eff) post_eff from (select content_id,post_eff from vu_ok union all select content_id,post_eff from air_v) z group by content_id),
  content_all as (select distinct content_id from (select content_id from vu_ok union all select content_id from air_v union all select content_id from pay_v) z),
  d_vid as (select vf.post_eff d, count(distinct vf.content_id) video, coalesce(sum(sv.views),0) views
    from vf_day vf left join tiktok_shop_videos sv on sv.id=vf.content_id, rng where vf.post_eff>=rng.d0 and vf.post_eff<=rng.d1 group by vf.post_eff),
  d_gmv as (select o.order_date d, coalesce(sum(o.price_amount*o.quantity),0) gmv
    from tiktok_affiliate_orders o join content_all ca on ca.content_id=o.content_id, rng
    where o.order_date>=rng.d0 and o.order_date<=rng.d1 group by o.order_date),
  daily as (select days.d, coalesce(o.don,0) don, coalesce(o.mau,0) mau, coalesce(g.gmv,0) gmv, coalesce(vd.video,0) video, coalesce(vd.views,0) views
    from days left join d_ord o on o.d=days.d left join d_gmv g on g.d=days.d left join d_vid vd on vd.d=days.d),
  air_only_p as (select vf.content_id from vf_day vf, rng where vf.post_eff>=rng.d0 and vf.post_eff<=rng.d1 and not exists (select 1 from vu_ok o where o.content_id=vf.content_id)),
  air_only_pool as (select distinct af.content_id from air_v af where not exists (select 1 from vu_ok o where o.content_id=af.content_id)),
  air_sum as (select (select count(*) from air_only_p) vids,
    coalesce((select sum(mv.views) from tiktok_video_monthly_views mv where mv.id in (select content_id from air_only_pool) and mv.ym in (select ym from months)),0) views),
  koc_content as (select uname, brand_canon, content_id from vu_ok
    union select o.creator_u uname, t.brand_canon, ca.content_id from content_all ca
      join tiktok_affiliate_orders o0 on o0.content_id=ca.content_id
      join lateral (select lower(regexp_replace(o0.creator_username,'^@','')) creator_u, o0.shop_id) o on true
      join tenure t on t.uname=o.creator_u and t.shop_id=o.shop_id),
  p_gmv as (select kc.uname, kc.brand_canon, coalesce(sum(o.price_amount*o.quantity),0) gmv
    from (select distinct uname, brand_canon, content_id from koc_content) kc
    join tiktok_affiliate_orders o on o.content_id=kc.content_id, rng
    where o.order_date>=rng.d0 and o.order_date<=rng.d1 group by 1,2),
  p_view as (select kc.uname, kc.brand_canon, coalesce(sum(mv.views),0) views
    from (select distinct uname, brand_canon, content_id from vu_ok) kc
    join tiktok_video_monthly_views mv on mv.id=kc.content_id and mv.ym in (select ym from months) group by 1,2),
  p_vtot as (select uname, brand_canon, count(*) videos_total,
      count(*) filter (where post_eff>=(select d0 from rng) and post_eff<=(select d1 from rng)) videos_period, max(post_eff) last_air
    from vu_ok group by uname, brand_canon),
  pairs as (select uname, brand_canon from cur union select uname, brand_canon from past union select uname, brand_canon from cast_p where uname is not null),
  kocs as (select pr.uname, pr.brand_canon brand, coalesce(g.gmv,0) gmv, coalesce(vw.views,0) views,
      coalesce(vt.videos_period,0) videos, coalesce(vt.videos_total,0) videos_total, coalesce(c.cast_amt,0) cast_amt, vt.last_air,
      coalesce((select min(start_d) from tenure t where t.uname=pr.uname and t.brand_canon=pr.brand_canon), null) since
    from pairs pr
    left join p_gmv g on g.uname=pr.uname and g.brand_canon=pr.brand_canon
    left join p_view vw on vw.uname=pr.uname and vw.brand_canon=pr.brand_canon
    left join p_vtot vt on vt.uname=pr.uname and vt.brand_canon=pr.brand_canon
    left join cast_p c on c.uname=pr.uname and c.brand_canon=pr.brand_canon)
  select jsonb_build_object(
    'daily', coalesce((select jsonb_agg(jsonb_build_object('d', to_char(d,'DD/MM'),'don',don,'mau',mau,'gmv',gmv,'video',video,'views',views) order by d) from daily),'[]'::jsonb),
    'air_videos', (select vids from air_sum), 'air_views', (select views from air_sum),
    'kocs', coalesce((select jsonb_agg(jsonb_build_object('uname',uname,'brand',brand,'gmv',gmv,'views',views,'videos',videos,
        'videos_total',videos_total,'cast',cast_amt,'last_air',last_air,'since',since) order by gmv desc) from kocs),'[]'::jsonb));
$function$


-- ===== staff_booking_report =====
CREATE OR REPLACE FUNCTION public.staff_booking_report(p_from date, p_to date)
 RETURNS TABLE(nhansu_id uuid, ten_nhansu text, so_don bigint, so_mau numeric, so_ngay bigint, tan_suat numeric, top_product text, brand_dist jsonb, koc_count bigint, koc_list jsonb, aff_gmv numeric, aff_videos bigint, aff_views numeric, cast_used numeric, chi_phi_mau numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
 SET work_mem TO '256MB'
AS $function$
  with rng as (select p_from::timestamptz as ts0, (p_to + 1)::timestamptz as ts1, p_from as d0, p_to as d1),
  months as (select to_char(gs,'YYYY-MM') ym from rng, generate_series(date_trunc('month', rng.d0), date_trunc('month', rng.d1), interval '1 month') gs),
  brand_map(brand_name, shop_id) as (values
    ('BODYMISS','7495107349171898427'),('REAL STEEL','7496180170889726491'), ('REALSTEEL','7496180170889726491'),
    ('EHERB','7494529979361168222'), ('EHERB','7495838925500090511'),('EHERB HCM','7494529979361168222'), ('EHERB HCM','7495838925500090511'),
    ('MILAGANICS','7494813818973817115'),('MOAW MOAWS','7495831977917385095'),('HEALMII','7494251668499498533'), ('HEALMI','7494251668499498533')),
  latest_col as materialized (select h as col from costing_data, jsonb_array_elements_text(headers) h where h like 'COSTING T% AMIS V2'
    order by (regexp_match(h, 'T(\\d+)\\.(\\d+) AMIS V2'))[2]::int desc, (regexp_match(h, 'T(\\d+)\\.(\\d+) AMIS V2'))[1]::int desc limit 1),
  cost_map as materialized (select barcode, max(cost) as cost from (
      select r->>'Mã' as barcode, case when trim(replace((r->>lc.col), ',', '')) ~ '^[0-9]+(\\.[0-9]+)?$' then trim(replace((r->>lc.col), ',', ''))::numeric else null end as cost
      from costing_data cd, latest_col lc, jsonb_array_elements(cd.rows) r where cd.key = 'latest') x
    where barcode is not null and barcode <> '' group by barcode),
  ord as (select dg.nhansu_id, count(distinct dg.id) as so_don, count(distinct dg.ngay_gui::date) as so_ngay
    from donguis dg, rng where dg.ngay_gui >= rng.ts0 and dg.ngay_gui < rng.ts1 and dg.nhansu_id is not null group by dg.nhansu_id),
  det as (select dg.nhansu_id, ct.so_luong, sp.ten_sanpham, b.ten_brand
    from donguis dg join chitiettonguis ct on ct.dongui_id = dg.id left join sanphams sp on ct.sanpham_id = sp.id left join brands b on sp.brand_id = b.id, rng
    where dg.ngay_gui >= rng.ts0 and dg.ngay_gui < rng.ts1 and dg.nhansu_id is not null),
  samp as (select nhansu_id, sum(so_luong) as so_mau from det group by nhansu_id),
  topp as (select nhansu_id, ten_sanpham, row_number() over (partition by nhansu_id order by sum(so_luong) desc) as rn from det where ten_sanpham is not null group by nhansu_id, ten_sanpham),
  bdist as (select nhansu_id, jsonb_object_agg(ten_brand, q) as dist from (select nhansu_id, ten_brand, sum(so_luong) as q from det where ten_brand is not null group by nhansu_id, ten_brand) z group by nhansu_id),
  per_order as (select dg.id, dg.nhansu_id, coalesce(sum(cm.cost*1.08*ctg.so_luong),0) + 5000 + case when dg.loai_ship='Hỏa tốc' then 50000 else 20000 end as order_total
    from donguis dg left join chitiettonguis ctg on ctg.dongui_id=dg.id left join sanphams sp on ctg.sanpham_id=sp.id left join cost_map cm on cm.barcode=sp.barcode, rng
    where dg.ngay_gui >= rng.ts0 and dg.ngay_gui < rng.ts1 and dg.nhansu_id is not null group by dg.id, dg.nhansu_id, dg.loai_ship),
  mau_cost as (select nhansu_id, sum(order_total) as chi_phi_mau from per_order group by nhansu_id),
  sa_cur as (select n.id as nhansu_id, lower(regexp_replace(a.koc_id,'^@','')) as uname, bm.shop_id,
      coalesce(a.approved_at, a.assigned_at)::date as tag_date, '2100-01-01'::date as end_d
    from koc_brand_assignments a join nhansu n on lower(trim(n.ten_nhansu)) = lower(trim(a.staff_name))
    left join brand_map bm on upper(trim(bm.brand_name)) = upper(trim(a.brand_name)) where a.status = 'approved'),
  hist_rm as (select lower(trim(staff_name)) staff, lower(regexp_replace(koc_id,'^@','')) uname, upper(trim(brand_name)) brand_u, max(created_at::date) end_d, min(tag_since) tag_since_rm
    from koc_assignment_history where action='remove' and not (actor ilike '%từ chối%' or actor ilike '%tu choi%') group by 1,2,3),
  hist_as as (select lower(trim(staff_name)) staff, lower(regexp_replace(koc_id,'^@','')) uname, upper(trim(brand_name)) brand_u, min(created_at::date) s
    from koc_assignment_history where action in ('assign','approve') group by 1,2,3),
  sa_past as (select n.id nhansu_id, r.uname, bm.shop_id, coalesce(r.tag_since_rm, h.s) tag_date, r.end_d
    from hist_rm r join nhansu n on lower(trim(n.ten_nhansu))=r.staff
    left join brand_map bm on upper(trim(bm.brand_name))=r.brand_u
    left join hist_as h on h.staff=r.staff and h.uname=r.uname and h.brand_u=r.brand_u
    where bm.shop_id is not null and coalesce(r.tag_since_rm, h.s) is not null),
  sa as (select * from sa_cur union all select * from sa_past),
  koc as (select nhansu_id, count(distinct uname) as koc_count, jsonb_agg(distinct uname) as koc_list from sa_cur group by nhansu_id),
  vu_asg as (select nhansu_id, content_id, min(post_eff) as post_eff, min(tag_date) as tag_date, max(end_d) as end_d from (
      select sa.nhansu_id, sa.tag_date, sa.end_d, o.content_id as content_id, min(o.order_date)::date as post_eff
        from sa join tiktok_affiliate_orders o on o.shop_id=sa.shop_id and lower(regexp_replace(o.creator_username,'^@',''))=sa.uname
        where o.content_type='VIDEO' and coalesce(o.content_id,'')<>'' group by sa.nhansu_id, sa.tag_date, sa.end_d, o.content_id
      union all
      select sa.nhansu_id, sa.tag_date, sa.end_d, v.id as content_id, v.post_date as post_eff
        from sa join tiktok_shop_videos v on v.shop_id=sa.shop_id and lower(regexp_replace(coalesce(v.username,''),'^@',''))=sa.uname
    ) z group by nhansu_id, content_id),
  vu_asg_ok as (select nhansu_id, content_id, post_eff, tag_date from vu_asg where post_eff is not null and post_eff >= coalesce(tag_date,'1900-01-01'::date) and post_eff < end_d),
  vu_air as (select a.nhansu_id, a.id_video as content_id, a.ngay_air as post_eff from air_links a where a.nhansu_id is not null and coalesce(a.id_video,'')<>''),
  -- MỚI: video ĐÃ TRẢ CAST (koc_payments) -> vẫn tính cho nhân sự đó dù chưa điền link air
  vu_pay_raw as (select distinct n.id as nhansu_id, (m.mm)[1] as content_id
    from koc_payments p join nhansu n on lower(trim(n.ten_nhansu)) = lower(trim(p.staff)),
         lateral regexp_matches(coalesce(p.air_link,''), '/video/(\\d{6,})', 'g') m(mm)
    where coalesce(p.cast_net,0) > 0 and coalesce((m.mm)[1],'') <> ''),
  vu_pay as (select r.nhansu_id, r.content_id,
      coalesce((select min(o.order_date)::date from tiktok_affiliate_orders o where o.content_id = r.content_id),
               (select v.post_date from tiktok_shop_videos v where v.id = r.content_id)) as post_eff
    from vu_pay_raw r),
  vu_all as (select distinct on (content_id) nhansu_id, content_id, post_eff from (
      select nhansu_id, content_id, post_eff, tag_date, 1 as pri from vu_asg_ok
      union all
      select nhansu_id, content_id, post_eff, '1900-01-01'::date as tag_date, 2 as pri from vu_air
      union all
      select nhansu_id, content_id, post_eff, '1900-01-01'::date as tag_date, 3 as pri from vu_pay
    ) z order by content_id, pri, tag_date desc, nhansu_id),
  aff as (select vu.nhansu_id, coalesce(sum(o.price_amount*o.quantity),0) as gmv
    from vu_all vu join tiktok_affiliate_orders o on o.content_id=vu.content_id, rng
    where o.order_date >= rng.d0 and o.order_date <= rng.d1 group by vu.nhansu_id),
  vid as (select nhansu_id, count(*) filter (where post_eff >= (select d0 from rng) and post_eff <= (select d1 from rng)) as so_video from vu_all group by nhansu_id),
  vid_v as (select va.nhansu_id, coalesce(sum(mv.views),0) as views from vu_all va
    join tiktok_video_monthly_views mv on mv.id = va.content_id and mv.ym in (select ym from months) group by va.nhansu_id),
  cst as (select n.id as nhansu_id, coalesce(sum(p.cast_net),0) as cast_used
    from koc_payments p join nhansu n on lower(trim(n.ten_nhansu)) = lower(trim(p.staff)), rng where p.pay_date >= rng.d0 and p.pay_date <= rng.d1 group by n.id)
  select n.id, n.ten_nhansu, coalesce(o.so_don,0), coalesce(s.so_mau,0), coalesce(o.so_ngay,0),
    case when coalesce(o.so_ngay,0) > 0 then round(o.so_don::numeric / o.so_ngay, 1) else 0 end,
    tp.ten_sanpham, coalesce(bd.dist,'{}'::jsonb), coalesce(k.koc_count,0), coalesce(k.koc_list,'[]'::jsonb),
    coalesce(af.gmv,0), coalesce(vd.so_video,0), coalesce(vv.views,0), coalesce(cu.cast_used,0), coalesce(mc.chi_phi_mau,0)
  from nhansu n
  left join ord o on o.nhansu_id=n.id left join samp s on s.nhansu_id=n.id left join topp tp on tp.nhansu_id=n.id and tp.rn=1
  left join bdist bd on bd.nhansu_id=n.id left join mau_cost mc on mc.nhansu_id=n.id
  left join koc k on k.nhansu_id=n.id left join aff af on af.nhansu_id=n.id left join vid vd on vd.nhansu_id=n.id
  left join vid_v vv on vv.nhansu_id=n.id left join cst cu on cu.nhansu_id=n.id
  where (o.nhansu_id is not null or k.nhansu_id is not null or cu.nhansu_id is not null)
    and n.id not in ('04b2e08d-7ff6-4020-a699-b619ae746852','d42754b4-1c5d-42c6-82a5-861a470090ff')
  order by coalesce(af.gmv,0) desc;
$function$


-- ===== staff_cast_air_links =====
CREATE OR REPLACE FUNCTION public.staff_cast_air_links(p_nhansu_id uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, link_air_koc text, id_kenh text, id_video text, ngay_air date, san_pham text, ten_brand text, cast_amount numeric, status text, total bigint, tong_cast numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
  with base as (
    select a.id, a.link_air_koc, a.id_kenh, a.id_video, a.ngay_air, a.san_pham,
      coalesce(b.ten_brand,'') as ten_brand,
      coalesce(nullif(regexp_replace(coalesce(a.\"cast\",''),'[^0-9]','','g'),''),'0')::numeric as cast_amount,
      case when a.ngay_air is not null and a.ngay_air <= current_date then 'Đã On-air' else 'Chưa air' end as status
    from air_links a left join brands b on b.id = a.brand_id
    where a.nhansu_id = p_nhansu_id
      and coalesce(nullif(regexp_replace(coalesce(a.\"cast\",''),'[^0-9]','','g'),''),'0')::numeric > 0
      and (coalesce(p_search,'')=''
           or lower(coalesce(a.id_kenh,'')) like '%'||lower(p_search)||'%'
           or coalesce(a.id_video,'') like '%'||p_search||'%'
           or lower(coalesce(a.san_pham,'')) like '%'||lower(p_search)||'%'
           or lower(coalesce(b.ten_brand,'')) like '%'||lower(p_search)||'%')
  )
  select id, link_air_koc, id_kenh, id_video, ngay_air, san_pham, ten_brand, cast_amount, status,
    count(*) over() as total, coalesce(sum(cast_amount) over(),0) as tong_cast
  from base order by cast_amount desc, ngay_air desc nulls last limit greatest(p_limit,1) offset greatest(p_offset,0);
$function$


-- ===== staff_clip_ratio =====
CREATE OR REPLACE FUNCTION public.staff_clip_ratio()
 RETURNS TABLE(staff_name text, tong integer, da_air integer, chua_air integer, no_qua_han integer, ty_le numeric)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '55s'
AS $function$
  with vu as (
    select uname, shop_id, max(post_eff)::date as last_air
    from koc_video_unit group by uname, shop_id
  ),
  t as (
    select a.staff_name, trim(both E' \\t\
\\r' from a.koc_id) as koc, a.assigned_at::date as tag_date, cbs.shop_id
    from koc_brand_assignments a
    join cast_brand_shop cbs on cbs.brand = a.brand_name
    where a.status = 'approved' and coalesce(trim(a.staff_name),'') <> ''
  ),
  airchk as (
    select t.staff_name, t.tag_date,
      (vu.last_air is not null and vu.last_air >= t.tag_date) as aired
    from t left join vu on vu.uname = t.koc and vu.shop_id = t.shop_id
  )
  select staff_name,
    count(*)::int as tong,
    count(*) filter (where aired)::int as da_air,
    count(*) filter (where not aired)::int as chua_air,
    count(*) filter (where not aired and current_date - tag_date > 30)::int as no_qua_han,
    round(100.0 * count(*) filter (where aired) / nullif(count(*),0), 1) as ty_le
  from airchk group by staff_name order by ty_le asc nulls last;
$function$


-- ===== staff_current_tags =====
CREATE OR REPLACE FUNCTION public.staff_current_tags(p_nhansu_id uuid)
 RETURNS TABLE(uname text, brand text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select lower(regexp_replace(a.koc_id,'^@','')) as uname,
    case when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' and upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like '%HCM%' then 'EHERB HCM'
         when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
         when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
         when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
         else upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) end as brand
  from koc_brand_assignments a join nhansu n on lower(trim(n.ten_nhansu))=lower(trim(a.staff_name))
  where n.id=p_nhansu_id and a.status='approved';
$function$


-- ===== staff_excluded_view_videos =====
CREATE OR REPLACE FUNCTION public.staff_excluded_view_videos(p_nhansu_id uuid, p_from date, p_to date)
 RETURNS TABLE(koc text, brand text, video_link text, ngay_air date, ngay_gan_tag date, so_ngay_air_truoc_tag integer, view_ky numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
  with months as (select to_char(gs,'YYYY-MM') ym from generate_series(date_trunc('month',p_from::timestamp), date_trunc('month',p_to::timestamp), interval '1 month') gs),
  bm(brand_name, shop_id) as (values ('BODYMISS','7495107349171898427'),('MOAW MOAWS','7495831977917385095'),('MILAGANICS','7494813818973817115'),
    ('EHERB','7494529979361168222'),('EHERB','7495838925500090511'),('EHERB HCM','7494529979361168222'),('EHERB HCM','7495838925500090511'),('HEALMII','7494251668499498533'),('HEALMI','7494251668499498533'),('REAL STEEL','7496180170889726491'),('REALSTEEL','7496180170889726491')),
  tag as (select lower(regexp_replace(a.koc_id,'^@','')) uname, a.brand_name brand, b.shop_id, coalesce(a.approved_at,a.assigned_at)::date tag_date
    from koc_brand_assignments a join nhansu n on lower(trim(n.ten_nhansu))=lower(trim(a.staff_name)) join bm b on upper(trim(b.brand_name))=upper(trim(a.brand_name))
    where n.id=p_nhansu_id and a.status='approved'),
  v as (select t.uname, (array_agg(t.brand))[1] brand, min(t.tag_date) tag_date, x.content_id, min(x.post_eff) post_eff from tag t
    join (select shop_id, lower(regexp_replace(creator_username,'^@','')) u, content_id, min(order_date)::date post_eff from tiktok_affiliate_orders where content_type='VIDEO' and coalesce(content_id,'')<>'' group by 1,2,3
          union all select shop_id, lower(regexp_replace(coalesce(username,''),'^@','')) u, id, post_date from tiktok_shop_videos) x on x.shop_id=t.shop_id and x.u=t.uname
    group by t.uname, x.content_id)
  select '@'||v.uname, v.brand, 'https://www.tiktok.com/@'||v.uname||'/video/'||v.content_id,
    v.post_eff, v.tag_date, (v.tag_date - v.post_eff)::int,
    coalesce((select sum(mv.views) from tiktok_video_monthly_views mv where mv.id=v.content_id and mv.ym in (select ym from months)),0)::numeric
  from v
  where v.post_eff < v.tag_date
    and not exists (select 1 from air_links al where al.nhansu_id=p_nhansu_id and al.id_video=v.content_id)
    and coalesce((select sum(mv.views) from tiktok_video_monthly_views mv where mv.id=v.content_id and mv.ym in (select ym from months)),0) > 0
  order by 7 desc;
$function$


-- ===== staff_order_tags =====
CREATE OR REPLACE FUNCTION public.staff_order_tags(p_staff text)
 RETURNS TABLE(koc_id text, brand_name text, tag_date date, days_since_tag integer, aired boolean, first_air date, aired_before boolean, video_count bigint)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '30s'
AS $function$
  with t as (
    select lower(regexp_replace(a.koc_id,'^@','')) as koc_id, a.brand_name,
      max(a.last_order_at) as tag_date, cbs.shop_id
    from koc_brand_assignments a
    join cast_brand_shop cbs on cbs.brand = a.brand_name
    where a.staff_name = p_staff and a.status = 'approved'
      and a.last_order_at is not null and a.last_order_at >= date '2026-07-01'
    group by 1, 2, cbs.shop_id
  ),
  vu as (
    select uname, shop_id, post_eff::date as post_d
    from koc_video_unit where uname in (select koc_id from t)
  ),
  agg as (
    select t.koc_id, t.brand_name, t.tag_date, t.shop_id,
      min(vu.post_d) filter (where vu.post_d >= t.tag_date) as first_air,
      count(*) filter (where vu.post_d >= t.tag_date) as cnt,
      bool_or(vu.post_d < t.tag_date) as aired_before
    from t left join vu on vu.uname = t.koc_id and vu.shop_id = t.shop_id
    group by t.koc_id, t.brand_name, t.tag_date, t.shop_id
  )
  select koc_id, brand_name, tag_date,
    (current_date - tag_date)::int as days_since_tag,
    (first_air is not null) as aired,
    first_air, coalesce(aired_before, false) as aired_before,
    coalesce(cnt, 0) as video_count
  from agg
  order by (first_air is not null), (current_date - tag_date) desc;
$function$


-- ===== staff_removed_kocs =====
CREATE OR REPLACE FUNCTION public.staff_removed_kocs(p_nhansu_id uuid)
 RETURNS TABLE(koc text, brand text, ngay_go date, ly_do text, dang_gan_lai boolean, last_air date, last_air_khac date, brand_khac text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '25s'
AS $function$
  with me as (select ten_nhansu from nhansu where id=p_nhansu_id),
  shop_brand(shop_id, nhan) as (values
    ('7495107349171898427','BODYMISS'),('7494529979361168222','EHERB VN'),('7495838925500090511','EHERB HCM'),
    ('7494813818973817115','MILAGANICS'),('7495831977917385095','MOAW'),('7494251668499498533','HEALMI'),
    ('7496180170889726491','REAL STEEL')),
  rm as (
    select distinct on (lower(regexp_replace(koc_id,'^@','')), upper(trim(brand_name)))
      lower(regexp_replace(koc_id,'^@','')) uname, brand_name, upper(trim(brand_name)) brand_u,
      created_at::date rm_date, actor
    from koc_assignment_history
    where action='remove' and not (actor ilike '%từ chối%' or actor ilike '%tu choi%')
      and lower(trim(staff_name)) = lower(trim((select ten_nhansu from me)))
      and created_at >= current_date - 90
    order by lower(regexp_replace(koc_id,'^@','')), upper(trim(brand_name)), created_at desc
  ),
  rmx as (select rm.*, cbs.shop_id from rm left join cast_brand_shop cbs on upper(trim(cbs.brand)) = rm.brand_u),
  un as (select distinct uname from rm),
  air as (
    select u, shop_id, max(la) la from (
      select lower(regexp_replace(creator_username,'^@','')) u, shop_id, max(order_date)::date la
        from tiktok_affiliate_orders where content_type='VIDEO' and order_date >= current_date - 200
          and lower(regexp_replace(creator_username,'^@','')) in (select uname from un) group by 1,2
      union all
      select lower(regexp_replace(coalesce(username,''),'^@','')) u, shop_id, max(post_date) la
        from tiktok_shop_videos where post_date >= current_date - 200
          and lower(regexp_replace(coalesce(username,''),'^@','')) in (select uname from un) group by 1,2
    ) z group by 1,2
  )
  select '@'||rmx.uname, rmx.brand_name, rmx.rm_date,
    case when rmx.actor='auto (quá hạn)' then '🤖 Tự động (quá hạn)'
         when rmx.actor ilike '%blacklist%' then '🚫 Blacklist'
         when rmx.actor ilike '%khoi-phuc%' then '↩️ Đã khôi phục'
         else '👤 '||coalesce(rmx.actor,'?') end,
    exists (select 1 from koc_brand_assignments a where lower(regexp_replace(a.koc_id,'^@',''))=rmx.uname and upper(trim(a.brand_name))=rmx.brand_u and a.status='approved'),
    (select max(a.la) from air a where a.u=rmx.uname and a.shop_id=rmx.shop_id),
    (select max(a.la) from air a where a.u=rmx.uname and a.shop_id is distinct from rmx.shop_id),
    -- brand KHÁC mà KOC air gần nhất (gộp nếu air nhiều brand cùng ngày)
    (select string_agg(distinct coalesce(sb.nhan, a.shop_id), ' + ')
       from air a left join shop_brand sb on sb.shop_id = a.shop_id
      where a.u = rmx.uname and a.shop_id is distinct from rmx.shop_id
        and a.la = (select max(a2.la) from air a2 where a2.u=rmx.uname and a2.shop_id is distinct from rmx.shop_id))
  from rmx
  order by rmx.rm_date desc, rmx.uname;
$function$


-- ===== staff_tenure_videos =====
CREATE OR REPLACE FUNCTION public.staff_tenure_videos(p_nhansu_id uuid, p_from date, p_to date)
 RETURNS TABLE(content_id text, kenh text, brand text, air_date date, view_period numeric, gmv_period numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
 SET work_mem TO '128MB'
AS $function$
  with rng as (select p_from as d0, p_to as d1),
  months as (select to_char(gs,'YYYY-MM') ym from generate_series(date_trunc('month',p_from::timestamp), date_trunc('month',p_to::timestamp), interval '1 month') gs),
  brand_map(brand_canon, shop_id) as (values
    ('BODYMISS','7495107349171898427'),('REALSTEEL','7496180170889726491'),
    ('EHERB','7494529979361168222'),('EHERB','7495838925500090511'),
    ('EHERB HCM','7494529979361168222'),('EHERB HCM','7495838925500090511'),
    ('MILAGANICS','7494813818973817115'),('MOAW','7495831977917385095'),('HEALMI','7494251668499498533')),
  me as (select lower(trim(ten_nhansu)) nm from nhansu where id=p_nhansu_id),
  cur as (select lower(regexp_replace(a.koc_id,'^@','')) uname,
      case when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' and upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like '%HCM%' then 'EHERB HCM'
           when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
           when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
           when upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
           else upper(regexp_replace(a.brand_name,'[^A-Za-z0-9]','','g')) end brand_canon,
      coalesce(a.approved_at,a.assigned_at)::date start_d, '2100-01-01'::date end_d
    from koc_brand_assignments a where a.status='approved' and lower(trim(a.staff_name))=(select nm from me)),
  own_start as (select lower(regexp_replace(koc_id,'^@','')) uname,
      case when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' and upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like '%HCM%' then 'EHERB HCM'
           when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
           when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
           when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
           else upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) end brand_canon, min(created_at::date) s
    from koc_assignment_history where action in ('assign','approve') and lower(trim(staff_name))=(select nm from me) group by 1,2),
  past_raw as (select lower(regexp_replace(koc_id,'^@','')) uname,
      case when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' and upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like '%HCM%' then 'EHERB HCM'
           when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'EHERB%' then 'EHERB'
           when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'HEALMI%' then 'HEALMI'
           when upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) like 'MOAW%' then 'MOAW'
           else upper(regexp_replace(brand_name,'[^A-Za-z0-9]','','g')) end brand_canon, max(created_at::date) end_d, min(tag_since) tag_since_rm
    from koc_assignment_history where action='remove' and not (actor ilike '%từ chối%' or actor ilike '%tu choi%') and lower(trim(staff_name))=(select nm from me) group by 1,2),
  past as (select p.uname, p.brand_canon, coalesce(p.tag_since_rm, os.s) start_d, p.end_d
    from past_raw p left join own_start os on os.uname=p.uname and os.brand_canon=p.brand_canon
    where coalesce(p.tag_since_rm, os.s) is not null),
  tenure_c as (select uname,brand_canon,start_d,end_d from cur union all select uname,brand_canon,start_d,end_d from past),
  tenure as (select tc.uname, tc.brand_canon, bm.shop_id, tc.start_d, tc.end_d from tenure_c tc join brand_map bm on bm.brand_canon=tc.brand_canon),
  -- TỐI ƯU: chỉ quét đơn/video của ĐÚNG shop + KOC của nhân sự này (trước đây gom cả bảng đơn -> rất chậm)
  sc as (select distinct shop_id from tenure),
  un as (select distinct uname from tenure),
  vsrc as (
    select o.shop_id, lower(regexp_replace(o.creator_username,'^@','')) u, o.content_id, min(o.order_date)::date post_eff
      from tiktok_affiliate_orders o
      where o.content_type='VIDEO' and coalesce(o.content_id,'')<>''
        and o.shop_id in (select shop_id from sc)
        and lower(regexp_replace(o.creator_username,'^@','')) in (select uname from un)
      group by 1,2,3
    union all
    select v.shop_id, lower(regexp_replace(coalesce(v.username,''),'^@','')) u, v.id, v.post_date
      from tiktok_shop_videos v
      where v.shop_id in (select shop_id from sc)
        and lower(regexp_replace(coalesce(v.username,''),'^@','')) in (select uname from un)),
  vpool as (select t.uname, t.brand_canon, s.content_id, min(s.post_eff) post_eff
    from tenure t join vsrc s on s.shop_id=t.shop_id and s.u=t.uname group by 1,2,3),
  vu_ok as (select vp.uname, vp.brand_canon, vp.content_id, vp.post_eff from vpool vp join tenure t on t.uname=vp.uname and t.brand_canon=vp.brand_canon
    where vp.post_eff is not null and vp.post_eff>=t.start_d and vp.post_eff<t.end_d),
  v1 as (select content_id, (array_agg(uname order by post_eff))[1] uname, (array_agg(brand_canon order by post_eff))[1] brand_canon, min(post_eff) post_eff
    from vu_ok group by content_id)
  select v1.content_id, '@'||v1.uname, v1.brand_canon, v1.post_eff,
    coalesce((select sum(mv.views) from tiktok_video_monthly_views mv where mv.id=v1.content_id and mv.ym in (select ym from months)),0)::numeric,
    coalesce((select sum(o.price_amount*o.quantity) from tiktok_affiliate_orders o, rng where o.content_id=v1.content_id and o.order_date>=rng.d0 and o.order_date<=rng.d1),0)::numeric
  from v1
  where v1.post_eff >= p_from and v1.post_eff <= p_to
  order by 5 desc, 4 desc;
$function$


-- ===== sync_order_tags =====
CREATE OR REPLACE FUNCTION public.sync_order_tags(p_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '90s'
AS $function$
declare v_ins int;
begin
  create temp table _cand on commit drop as
  select distinct on (uname, brand_name) uname, brand_name, staff_name, shop_id, adate
  from (
    select lower(regexp_replace(d.koc_id_kenh,'^@','')) as uname,
           case b.ten_brand when 'HEALMI' then 'HEALMII' else b.ten_brand end as brand_name,
           coalesce(n.ten_nhansu,'') as staff_name, d.ngay_gui::date as adate, cbs.shop_id
    from donguis d
    join chitiettonguis ct on ct.dongui_id = d.id
    join sanphams sp on sp.id = ct.sanpham_id
    join brands b on b.id = sp.brand_id
    join cast_brand_shop cbs on cbs.brand = b.ten_brand
    left join nhansu n on n.id = d.nhansu_id
    where coalesce(d.koc_id_kenh,'') <> '' and d.ngay_gui >= now() - (p_days || ' days')::interval
  ) x where x.staff_name <> ''
  order by uname, brand_name, adate desc;

  -- (A) INSERT tag MỚI: (KOC,brand) order mà CHƯA có tag + KÊNH KHÔNG đang bị blacklist.
  --     Không còn cooldown 30 ngày — mọi kiểu gỡ (admin/nhân sự/từ chối/quá hạn) order lại là gắn lại.
  with elig as (
    select c.* from _cand c
    where not exists (select 1 from koc_brand_assignments a where a.koc_id = c.uname and a.brand_name = c.brand_name)
      and not exists (select 1 from koc_blacklist bl
                       where lower(regexp_replace(bl.id_kenh,'^@','')) = c.uname)
  ),
  ins as (
    insert into koc_brand_assignments (koc_id, brand_name, staff_name, assigned_at, last_order_at, updated_at, status, approved_by, approved_at)
    select uname, brand_name, staff_name, adate, adate, now(), 'approved', 'auto-order', now() from elig
    returning koc_id, brand_name, staff_name
  ),
  hist as (
    insert into koc_assignment_history (koc_id, brand_name, staff_name, action, actor)
    select koc_id, brand_name, staff_name, 'assign', 'auto-order' from ins returning 1
  )
  select count(*) into v_ins from hist;

  -- (B) reset last_order_at cho tag đã có bị order lại.
  update koc_brand_assignments a
  set last_order_at = greatest(coalesce(a.last_order_at, c.adate), c.adate), updated_at = now()
  from _cand c
  where a.koc_id = c.uname and a.brand_name = c.brand_name
    and (a.last_order_at is null or a.last_order_at < c.adate);

  -- (C) tag auto-order chưa air → đổi chủ sang đơn gần nhất.
  update koc_brand_assignments a
  set assigned_at = c.adate, staff_name = c.staff_name, updated_at = now(), approved_at = now()
  from _cand c
  where a.koc_id = c.uname and a.brand_name = c.brand_name
    and a.approved_by = 'auto-order'
    and a.assigned_at::date < c.adate
    and not exists (select 1 from koc_video_unit v where v.uname = c.uname and v.shop_id = c.shop_id);

  return v_ins;
end $function$


-- ===== update_listed_price_rows_updated_at =====
CREATE OR REPLACE FUNCTION public.update_listed_price_rows_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$


-- ===== upsert_shop_videos_max =====
CREATE OR REPLACE FUNCTION public.upsert_shop_videos_max(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$


-- ===== upsert_video_month_min =====
CREATE OR REPLACE FUNCTION public.upsert_video_month_min(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  insert into tiktok_video_monthly_views as t (id, ym, shop_id, views, updated_at)
  select x.id, x.ym, x.shop_id, x.views, now()
  from jsonb_to_recordset(p_rows) as x(id text, ym text, shop_id text, views bigint)
  where x.id is not null and x.id <> ''
  on conflict (id, ym) do update set views = greatest(coalesce(t.views,0), coalesce(excluded.views,0)), updated_at = now();
  get diagnostics n = row_count;
  return n;
end $function$

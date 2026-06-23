-- #4 Cảnh báo KOC chưa lên video sau 14 ngày
-- Đơn gửi 14–45 ngày trước mà Hiệu suất KOC chưa đo được video nào của kênh đó (map theo brand → gian hàng).
-- eHerb + eHerb HCM tính chung 1 KOC. Admin gỡ tay (bảng dismissed); hệ thống tự gỡ khi tải được video trùng kênh.

-- Bảng lưu cảnh báo đã gỡ
create table if not exists public.koc_video_warning_dismissed (
  dongui_id uuid primary key,
  dismissed_by text,
  dismissed_at timestamptz default now()
);
alter table public.koc_video_warning_dismissed enable row level security;
drop policy if exists kvwd_all on public.koc_video_warning_dismissed;
create policy kvwd_all on public.koc_video_warning_dismissed for all using (true) with check (true);

-- RPC trả jsonb array các đơn cần cảnh báo
create or replace function public.koc_no_video_warnings()
returns jsonb language sql stable set statement_timeout to '20s'
as $function$
  with rng as (select (now() - interval '14 days')::date as d_late, (now() - interval '45 days')::date as d_floor),
  brand_shop(bkey, shop_id) as (values
    ('BODYMISS','7495107349171898427'),
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
  vids as (
    select v.shop_id, lower(trim(regexp_replace(coalesce(v.username,''),'^@',''))) as ch, v.post_date
    from tiktok_shop_videos v, rng
    where v.shop_id in (select shop_id from brand_shop) and v.post_date >= rng.d_floor
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
$function$;

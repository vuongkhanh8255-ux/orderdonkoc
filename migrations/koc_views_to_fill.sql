-- "LẤP VIEW THEO LINK KOC" (option C): danh sách (video, tháng) CẦN LẤP view → action fill_koc_views
-- gọi API /shop_videos/{id}/performance lấy view tháng (kể cả video CŨ) → đổ vào tiktok_video_monthly_views.
-- GỘP 2 NGUỒN video:
--   (A) đơn affiliate (video RA ĐƠN — tự động, KHÔNG cần ai điền link)
--   (B) air_links (link tụi nó điền — phủ video booking CHƯA ra đơn + video cũ). Map brand_id→brand→shop.
-- Trả thêm username (creator từ đơn). Ưu tiên tháng gần nhất. Lọc ngày air rác (>2026-12-31).
-- MASUBE/REAL STEEL không có TikTok shop → bỏ. Đã apply lên DB 2026-06-20.
drop function if exists public.koc_views_to_fill(text,int);
create function public.koc_views_to_fill(p_shop_id text, p_limit int default 40)
returns table(video_id text, ym text, username text)
language sql stable set statement_timeout to '25s'
as $function$
  with bm(brand_name, shop_id) as (values
    ('BODYMISS','7495107349171898427'), ('EHERB','7494529979361168222'),
    ('EHERB HCM','7495838925500090511'), ('MILAGANICS','7494813818973817115'),
    ('MOAW MOAWS','7495831977917385095'), ('HEALMI','7494251668499498533')),
  order_src as (
    select content_id as vid, date_trunc('month', order_date)::date as m,
           to_char(order_date, 'YYYY-MM') as ym, max(creator_username) as uname
    from tiktok_affiliate_orders
    where shop_id = p_shop_id and content_type = 'VIDEO' and coalesce(content_id,'') <> '' and order_date >= date '2026-01-01'
    group by content_id, date_trunc('month', order_date)::date, to_char(order_date, 'YYYY-MM')
  ),
  air_src as (
    select al.id_video as vid, date_trunc('month', al.ngay_air)::date as m,
           to_char(al.ngay_air, 'YYYY-MM') as ym, ''::text as uname
    from air_links al join brands b on b.id = al.brand_id join bm on bm.brand_name = b.ten_brand
    where bm.shop_id = p_shop_id and al.id_video ~ '^[0-9]+$'
      and al.ngay_air >= date '2026-01-01' and al.ngay_air <= date '2026-12-31'
    group by al.id_video, date_trunc('month', al.ngay_air)::date, to_char(al.ngay_air, 'YYYY-MM')
  ),
  src as (
    select vid, ym, max(m) as m, max(uname) as uname
    from (select * from order_src union all select * from air_src) z
    group by vid, ym
  )
  select s.vid, s.ym, s.uname
  from src s
  where not exists (select 1 from tiktok_video_monthly_views mv where mv.id = s.vid and mv.ym = s.ym)
  order by s.m desc
  limit greatest(1, least(p_limit, 80));
$function$;
grant execute on function public.koc_views_to_fill(text,int) to anon, authenticated;

-- cột đánh dấu lần fill cuối (để action xoay shop)
alter table public.tiktok_affiliate_sync_meta add column if not exists viewfill_last_run_at timestamptz;

-- "LẤP VIEW THEO LINK KOC" (option C): danh sách (video, tháng) CẦN LẤP view.
-- Video KOC CÓ ĐƠN trong tháng (content_type=VIDEO, content_id) nhưng THIẾU dòng ở
-- tiktok_video_monthly_views → action fill_koc_views (api/tiktok-shop/analytics.js) gọi API
-- /shop_videos/{id}/performance lấy đúng view tháng đó (kể cả video CŨ) → đổ vào bảng.
-- Trả thêm username (creator từ đơn) để gán view đúng KOC. Ưu tiên tháng gần nhất.
-- Đã apply lên DB 2026-06-20.
drop function if exists public.koc_views_to_fill(text,int);
create function public.koc_views_to_fill(p_shop_id text, p_limit int default 40)
returns table(video_id text, ym text, username text)
language sql stable set statement_timeout to '25s'
as $function$
  select o.content_id as video_id, o.ym_str as ym, o.uname as username
  from (
    select content_id,
           date_trunc('month', order_date)::date as m,
           to_char(order_date, 'YYYY-MM') as ym_str,
           max(creator_username) as uname
    from tiktok_affiliate_orders
    where shop_id = p_shop_id and content_type = 'VIDEO' and coalesce(content_id,'') <> ''
      and order_date >= date '2026-01-01'
    group by content_id, date_trunc('month', order_date)::date, to_char(order_date, 'YYYY-MM')
  ) o
  where not exists (
    select 1 from tiktok_video_monthly_views mv where mv.id = o.content_id and mv.ym = o.ym_str
  )
  order by o.m desc
  limit greatest(1, least(p_limit, 80));
$function$;
grant execute on function public.koc_views_to_fill(text,int) to anon, authenticated;

-- cột đánh dấu lần fill cuối (để action xoay shop)
alter table public.tiktok_affiliate_sync_meta add column if not exists viewfill_last_run_at timestamptz;

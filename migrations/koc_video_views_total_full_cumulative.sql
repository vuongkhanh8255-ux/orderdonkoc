-- "Tổng view" cho gian thuộc koc_full_video_shops = LŨY KẾ view của TẤT CẢ video đăng tới hết kỳ
-- (cả video air trước đó + air trong kỳ), lấy từ cột tiktok_shop_videos.views (đầy đủ, gồm video nạp Excel).
-- Gian khác giữ logic cũ (cộng view-THÁNG từ tiktok_video_monthly_views — view phát sinh trong kỳ).
-- Lý do: gian full đã nạp đủ video nhưng view-tháng chỉ có cho video synced → dùng cột views lũy kế mới đủ.
create or replace function public.koc_video_views_total(p_shop_id text, p_start date, p_end date)
returns bigint language sql stable set statement_timeout to '20s'
as $function$
  select case
    when p_shop_id is not null and exists(select 1 from koc_full_video_shops f where f.shop_id = p_shop_id) then
      (select coalesce(sum(views),0)::bigint
         from tiktok_shop_videos
        where shop_id = p_shop_id
          and (p_end is null or post_date is null or post_date <= p_end))
    else
      (with months as (
         select to_char(gs,'YYYY-MM') ym
         from generate_series(date_trunc('month', coalesce(p_start, date '2026-01-01')),
                              date_trunc('month', coalesce(p_end, current_date)),
                              interval '1 month') gs
       )
       select coalesce(sum(views),0)::bigint
       from tiktok_video_monthly_views
       where (p_shop_id is null or shop_id = p_shop_id) and ym in (select ym from months))
  end;
$function$;
grant execute on function public.koc_video_views_total(text,date,date) to anon, authenticated;

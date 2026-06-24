-- Backfill view-THÁNG (tiktok_video_monthly_views) từ Excel — GREATEST (chỉ nâng, không hạ). SECURITY DEFINER (bỏ qua RLS).
-- ⚠️ QUAN TRỌNG cho quy trình nạp Excel 1 gian: nạp Excel PHẢI ghi CẢ 2 chỗ:
--   (1) tiktok_shop_videos.views (qua upsert_shop_videos_max) — cho đếm video + view-snapshot.
--   (2) tiktok_video_monthly_views (ym của kỳ Excel, qua hàm này) — cho VIEW per-kỳ (card "Tổng view" + cột VIEW per-KOC).
-- Nếu quên (2) → view per-kỳ bị undercount (video Excel không có dòng view-tháng → đếm 0). Đã sửa Bodymiss 24/6.
create or replace function public.upsert_video_month_min(p_rows jsonb)
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare n integer;
begin
  insert into tiktok_video_monthly_views as t (id, ym, shop_id, views, updated_at)
  select x.id, x.ym, x.shop_id, x.views, now()
  from jsonb_to_recordset(p_rows) as x(id text, ym text, shop_id text, views bigint)
  where x.id is not null and x.id <> ''
  on conflict (id, ym) do update set views = greatest(coalesce(t.views,0), coalesce(excluded.views,0)), updated_at = now();
  get diagnostics n = row_count;
  return n;
end $function$;
grant execute on function public.upsert_video_month_min(jsonb) to anon, authenticated;

-- Cache kết quả cào view kênh KOC (tikwm) — trang Order đọc nhanh + Edge Function ghi.
-- Đi kèm Edge Function Supabase `koc-channel-views` (source: supabase/functions/koc-channel-views/index.ts).
create table if not exists koc_channel_views (
  username    text primary key,          -- id kênh, normalize lower + bỏ @
  total_view  bigint  default 0,          -- tổng view 7 video (bỏ video ghim is_top)
  video_count int     default 0,
  dat         boolean default false,       -- ĐẠT = total_view >= ngưỡng (1500)
  videos      jsonb   default '[]'::jsonb, -- [{cover, view, id}]
  err         text,
  checked_at  timestamptz default now()
);
grant select on koc_channel_views to anon, authenticated;

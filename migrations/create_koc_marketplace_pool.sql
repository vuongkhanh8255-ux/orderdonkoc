-- Module 8 (Booking) — pool KOC cào từ TikTok Creator Marketplace (action koc_hunt).
create table if not exists koc_marketplace_pool (
  username     text primary key,          -- id kênh (lower + bỏ @)
  open_id      text, nickname text, avatar text,
  followers    bigint  default 0,
  avg_views    bigint  default 0,          -- view TB video (ecom)
  gmv_tier     text, gmv numeric default 0, video_gmv numeric default 0, live_gmv numeric default 0,
  region       text, categories jsonb default '[]'::jsonb, gender text, age_ranges jsonb default '[]'::jsonb,
  da_lien_he   boolean default false, lien_he_boi text, ghi_chu text,   -- đội booking cập nhật (crawl KHÔNG đụng)
  first_seen   timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists idx_kmp_followers on koc_marketplace_pool (followers desc);
create index if not exists idx_kmp_avgviews on koc_marketplace_pool (avg_views desc);
grant select, insert, update, delete on koc_marketplace_pool to anon, authenticated;

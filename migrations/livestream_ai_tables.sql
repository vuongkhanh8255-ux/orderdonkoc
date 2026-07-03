-- 3/7/2026 — Module 4 Live AI (dashboard trong koc-tool). Kho câu hỏi→clip cho Desktop Agent OBS đọc.
-- Thay việc sửa faq.json tay: quản lý intent bằng UI, lưu Supabase. Agent đọc từ đây (hoặc xuất faq.json).
create table if not exists public.livestream_intents (
  id          text primary key,                 -- slug: 'gia','ship'...
  label       text not null,
  keywords    jsonb not null default '[]'::jsonb, -- mảng string, không dấu/có dấu đều được (agent tự bỏ dấu)
  clip        text default '',                   -- đường dẫn file .mp4 trên máy phát (OBS đọc), hoặc URL
  enabled     boolean default true,
  sort_order  int default 0,
  updated_at  timestamptz default now()
);
grant all on public.livestream_intents to anon, authenticated;

create table if not exists public.livestream_config (
  id             text primary key default 'default',
  cooldown_sec   int default 45,   -- không phát lại cùng clip trong X giây
  min_confidence int default 1,    -- điểm keyword tối thiểu để coi là khớp
  max_queue      int default 3,    -- giới hạn hàng đợi khi comment dồn dập
  updated_at     timestamptz default now()
);
grant all on public.livestream_config to anon, authenticated;
insert into public.livestream_config (id) values ('default') on conflict (id) do nothing;

-- Seed 5 câu FAQ mẫu (giống faq.example.json) nếu bảng trống
insert into public.livestream_intents (id, label, keywords, clip, sort_order) values
  ('gia',      'Hỏi giá',                '["gia","bao nhieu","bn","nhieu tien","gia sao","may xu","nhiu tien"]'::jsonb, 'D:/live-clips/faq_gia.mp4', 1),
  ('ship',     'Phí ship / giao hàng',   '["ship","phi ship","freeship","free ship","giao hang","bao lau nhan","may ngay"]'::jsonb, 'D:/live-clips/faq_ship.mp4', 2),
  ('size',     'Size / còn hàng',        '["size","con hang","con khong","con ko","het chua","co size"]'::jsonb, 'D:/live-clips/faq_size.mp4', 3),
  ('voucher',  'Voucher / khuyến mãi',   '["voucher","ma giam","khuyen mai","giam gia","code","ma"]'::jsonb, 'D:/live-clips/faq_voucher.mp4', 4),
  ('chatlieu', 'Chất liệu / thành phần', '["chat lieu","thanh phan","vai gi","co ben khong","chat the nao"]'::jsonb, 'D:/live-clips/faq_chatlieu.mp4', 5)
on conflict (id) do nothing;

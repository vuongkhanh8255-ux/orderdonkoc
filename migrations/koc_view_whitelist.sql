-- KOC ƯU TIÊN: được tạo đơn dù KHÔNG đủ view (bỏ qua check <1500). Chỉ admin điền (gate client-side theo currentUser.role).
create table if not exists koc_view_whitelist (
  username   text primary key,   -- id kênh, normalize lower + bỏ @
  note       text,
  added_by   text,
  created_at timestamptz default now()
);
grant select, insert, update, delete on koc_view_whitelist to anon, authenticated;

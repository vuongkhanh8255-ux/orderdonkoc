-- Tiến độ cào marketplace theo từng gian (action koc_hunt tiếp trang mỗi lượt).
create table if not exists koc_hunt_state (
  seller_name text primary key,
  page_token  text,                 -- token trang kế; null = quét lại từ đầu
  total_seen  int default 0,
  last_run_at timestamptz default now()
);
grant select, insert, update, delete on koc_hunt_state to anon, authenticated;

-- Lưu "mẫu giá Flash Sale" upload từ Excel để tái sử dụng (chọn lại không cần nhập tay).
-- rows: [{ item_id, model_id, item_name, model_name, original_price, price, stock }]
create table if not exists public.flash_sale_templates (
  id bigint generated always as identity primary key,
  name text not null,
  shop_id text,
  rows jsonb not null,
  created_at timestamptz default now()
);
create index if not exists flash_sale_templates_shop_idx on public.flash_sale_templates (shop_id, created_at desc);

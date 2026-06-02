-- "File Nhanh" — sản phẩm export từ Nhanh.vn, chỉ giữ 3 cột.
-- Dùng ở tab Lưu Trữ Data (DataArchiveTab → NhanhProductsSection).
-- Frontend upload .xlsx → parse (Mã SP / Tên SP / Giá bán + VAT) → upsert theo ma_san_pham.
-- RLS để mặc định (off) cho khớp các bảng import khác (tiktok_performance, costing_data...).

create table if not exists public.nhanh_products (
  id           bigint generated always as identity primary key,
  ma_san_pham  text not null,
  ten_san_pham text,
  gia_ban_vat  numeric,
  updated_at   timestamptz default now()
);

create unique index if not exists nhanh_products_ma_uidx on public.nhanh_products (ma_san_pham);

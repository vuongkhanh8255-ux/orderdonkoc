-- Bảng tra brand (điền tay) → gian hàng (shop_id) mà brand đó thực sự bán.
-- Dùng cho cảnh báo SAI BRAND ở Module Thanh toán KOC (koc_payment_brand_audit).
-- Quy ước: MASUBE = gian CÁ NHÂN (KHÔNG map vào gian nào). Real Steel = GIAN ĐỘC LẬP (tách khỏi Body Miss).
create table if not exists public.cast_brand_shop (
  brand   text primary key,
  shop_id text not null,
  note    text
);

-- Seed lại toàn bộ mapping chuẩn (idempotent).
delete from public.cast_brand_shop;
insert into public.cast_brand_shop (brand, shop_id, note) values
  ('BODYMISS','7495107349171898427','Body Miss'),
  ('EHERB','7494529979361168222','eHerb (air_links spelling) = eHerb VN'),
  ('EHERB HCM','7495838925500090511','eHerb HCM'),
  ('EHERB VN','7494529979361168222','eHerb VN'),
  ('HEALMI','7494251668499498533','Healmii'),
  ('HEALMII','7494251668499498533','Healmii'),
  ('MILAGANICS','7494813818973817115','Milaganics'),
  ('MOAW MOAWS','7495831977917385095','Moaw (air_links spelling)'),
  ('MOAWMOAWS','7495831977917385095','Moaw Moaws'),
  ('REAL STEEL','7496180170889726491','Real Steel - GIAN DOC LAP (tach khoi Body Miss)'),
  ('REALSTEEL','7496180170889726491','Real Steel - GIAN DOC LAP (tach khoi Body Miss)');
-- LƯU Ý: MASUBE cố ý KHÔNG có trong bảng này (gian cá nhân, không tính cast cho gian nào).

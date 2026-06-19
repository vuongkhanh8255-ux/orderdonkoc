-- Tách HỢP ĐỒNG (file PDF/Excel/Word) ra khỏi "Tin nhắn (ảnh)" trong form Thanh toán KOC.
--   contract_link  = giữ nguyên → ảnh tin nhắn (upload image/*).
--   contract_file  = MỚI → URL file hợp đồng (PDF/Excel...), mỗi URL 1 dòng.
-- File vẫn upload lên bucket Storage 'expense-files' (public, không giới hạn MIME).
-- Đã apply lên DB 2026-06-19.
alter table public.koc_payments add column if not exists contract_file text;
comment on column public.koc_payments.contract_file is 'URL file hợp đồng (PDF/Excel/Word...), mỗi URL 1 dòng. Tách khỏi contract_link (ảnh tin nhắn).';

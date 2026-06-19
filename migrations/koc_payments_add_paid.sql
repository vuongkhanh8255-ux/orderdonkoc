-- Thêm trạng thái "đã thanh toán" (tách khỏi "kế toán duyệt") cho tab Thanh toán KOC.
--   accountant_approved = kế toán DUYỆT (đã có) · paid = đã CHI tiền (mới) · paid_at = thời điểm chi.
-- Tick 2 ô (duyệt + đã TT) ở frontend yêu cầu mật khẩu (ACTION_PW trong KocPaymentTab.jsx).
-- Đã apply lên DB 2026-06-19.
alter table public.koc_payments add column if not exists paid boolean not null default false;
alter table public.koc_payments add column if not exists paid_at timestamptz;
comment on column public.koc_payments.paid is 'Đã thanh toán (đã chi tiền). Tách khỏi accountant_approved (kế toán duyệt).';

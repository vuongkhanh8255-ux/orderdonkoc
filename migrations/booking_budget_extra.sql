-- Ngân sách CỘNG TAY cho booking (29/6/2026). Định mức tự tính (base = GMV lũy kế×2.2%, sàn 15tr) +
-- carryover, nay thêm khoản cộng tay theo (nhân sự × tháng). Cộng vào "ĐM thực" ở CẢ Tạm đối chiếu
-- (BookingBudgetTab) lẫn Báo cáo nhân sự (BookingStaffReportTab) — 2 chỗ dùng CHUNG hàm src/lib/bookingBudget.js
-- nên khớp 100%. Frontend đọc trực tiếp bảng này (anon/authenticated).
create table if not exists public.booking_budget_extra (
  id uuid primary key default gen_random_uuid(),
  staff_name text not null,
  ym text not null,                 -- 'YYYY-MM'
  amount numeric not null default 0,
  note text,
  created_at timestamptz default now()
);
grant select, insert, update, delete on public.booking_budget_extra to anon, authenticated;

-- T6/2026: +10tr book content/sản phẩm mới (1 lần) — Khánh chốt 29/6/2026.
insert into public.booking_budget_extra (staff_name, ym, amount, note) values
  ('Trúc Quỳnh','2026-06',10000000,'Book content mới'),
  ('Nguyên Bảo','2026-06',10000000,'Book content mới'),
  ('Tường Vi','2026-06',10000000,'Book sản phẩm mới Mila'),
  ('Hoàng Vũ','2026-06',10000000,'Book sản phẩm mới')
on conflict do nothing;

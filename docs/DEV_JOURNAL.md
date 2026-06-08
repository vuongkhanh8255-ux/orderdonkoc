# Stella Kinetics Dev Journal

## 2026-05-12

### Bảng giá niêm yết
- Đã thêm mục con `Bảng giá niêm yết` trong nhánh `Ecom`.
- Bảng có các cột: `Tên sản phẩm`, `Barcode`, `Brand`, `Sàn`, `Giá Niêm yết`, `Promotion`, `Giá regular`, `Giá FS`, `Voucher`, `Giá final`.
- Có nhập liệu trực tiếp, thêm dòng, xóa dòng, nhân bản dòng, import Excel, export Excel.
- Có filter theo text, barcode, brand, sàn, promotion.
- Có công thức kiểu mini Excel:
  - Web dùng số dòng theo bảng web, dòng đầu là `1`, ví dụ `=E1-G1-I1`.
  - Hỗ trợ alias như `=regularPrice-voucher`, `=listedPrice*0,9`.
  - Web hỗ trợ dấu thập phân `,` và `.`; khi export Excel sẽ ưu tiên dấu `,`.
- Đã sửa lỗi export:
  - Formula row reference bị lệch do Excel có header ở row 1. Khi export, công thức web `E1` sẽ được shift thành Excel `E2`.
  - Decimal trong công thức export đổi từ `.` sang `,`, ví dụ `=E1*0.2` trên web export thành `=E2*0,2`.

### Dashboard booking / Định danh KOC
- Đã thêm bảng `Định danh KOC theo đơn & Brand quản lí`.
- Có tab từng brand.
- Có nút `+` nhỏ trên từng ô brand để gán nhân sự booking.
- Ô đã gán chuyển đỏ và hiển thị nhân sự + thời gian gán.
- Đã tạo migration `migrations/create_koc_brand_assignments.sql` để lưu phân bổ KOC-brand lên Supabase.
- Cần chạy SQL migration này trên Supabase nếu muốn lưu cloud qua máy khác.

### Task & Notes
- Đã chuyển task/note sang cơ chế lưu Supabase, có fallback local.
- Migration: `migrations/create_task_notes.sql`.
- User đã chạy SQL và xác nhận tạo bảng thành công.

### TikTok Shop API
- Đã tạo callback route `/tiktok-shop/callback` qua Vercel API.
- Đã tạo migration `migrations/create_tiktok_shop_connections.sql`.
- Đã set env production trên Vercel:
  - `TIKTOK_SHOP_APP_KEY`
  - `TIKTOK_SHOP_APP_SECRET`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Đã deploy production nhiều lần để test callback.
- Vấn đề còn thiếu/sai:
  - TikTok authorize redirect có `code`, nhưng token exchange vẫn chưa thành công.
  - Lần gần nhất lỗi do token endpoint/path chưa khớp, đang thử host `auth.tiktok-shops.com/api/v2/token/get`.
  - Nếu vẫn lỗi, cần chụp lại khung `attempts` để xác định endpoint đúng theo app/region hiện tại.

### Vercel/domain
- Domain production đang dùng:
  - `https://koc-tool.vercel.app`
  - `https://stellakinetics.space`
- Callback TikTok cấu hình:
  - `https://stellakinetics.space/tiktok-shop/callback`

## Ghi chú cần làm tiếp
- Deploy lại sau khi sửa token endpoint TikTok nếu chưa deploy.
- Kiểm tra export Excel từ `Bảng giá niêm yết` bằng file thật:
  - Web `=E1*0,2` hoặc `=E1*0.2` phải export ra Excel row data đầu là `=E2*0,2`.
  - Excel không được trỏ nhầm header row.
- Sau khi TikTok token exchange thành công:
  - Gọi Order List/Order Detail.
  - Tạo bảng Supabase `tiktok_shop_orders`.
  - Hiển thị tab `TikTok Shop Orders` bằng order thật để submit lại App Review.

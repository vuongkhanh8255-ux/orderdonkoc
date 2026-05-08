# SYSTEM GUIDE — Stella Kinetics KOC Tool

> Tài liệu mô tả toàn bộ hệ thống, dành cho AI assistant hoặc developer mới tiếp cận dự án.
> Cập nhật lần cuối: 2026-05-08

---

## 1. Tổng Quan

| Mục | Chi tiết |
|-----|----------|
| **Tên dự án** | koc-tool (Stella Kinetics Internal Tool) |
| **Mục đích** | Công cụ nội bộ quản lý đơn hàng KOC, hợp đồng, link Air, hiệu suất booking, camp TikTok và task nội bộ |
| **GitHub** | `https://github.com/vuongkhanh8255-ux/orderdonkoc` |
| **Deploy** | Vercel — tự động deploy khi push lên nhánh `main` |
| **Tech stack** | React 19 + Vite, Supabase (database), Recharts (biểu đồ), SheetJS / xlsx-js-style (Excel), Google Gemini AI |
| **Styling** | Inline styles + Tailwind CSS, theme màu cam (orange `#ea580c` / amber `#f59e0b`) |
| **Font** | Outfit (Google Fonts) |

---

## 2. Cấu Trúc File Quan Trọng

```
src/
├── App.jsx                        # Root app, sidebar layout, routing theo view key
├── main.jsx                       # Entry point
├── supabaseClient.js              # Khởi tạo Supabase client (đọc từ .env)
├── context/
│   └── AppDataContext.jsx         # Global state: brands, nhanSus, sanPhams, orders, airlinks...
└── components/
    ├── LoginPage.jsx              # Trang đăng nhập + ACCOUNTS + ROLE_VIEWS
    ├── AIChat.jsx                 # Floating AI chat (Google Gemini)
    ├── SidebarNotes.jsx           # (Deprecated) panel note cũ trong sidebar
    │
    ├── DashboardTab.jsx           # Booking Dashboard
    ├── OrderTab.jsx               # Đơn Hàng KOC
    ├── BookingPerformanceTab.jsx  # Báo Cáo Hiệu Suất
    ├── ContractTab.jsx            # Hợp Đồng
    ├── AirLinksTab.jsx            # Quản Lý Link Air
    │
    ├── StellaDashboardTab.jsx     # Stella Dashboard (Ecom)
    ├── CSKHTab.jsx                # CSKH (Chăm sóc khách hàng)
    ├── LivestreamTab.jsx          # Quản lý Livestream
    │
    ├── ExpenseEcomTab.jsx         # Ngân Sách Ecom
    ├── DataArchiveTab.jsx         # Lưu Trữ Data
    │
    ├── CampRegistrationTab.jsx    # Đăng Kí Camp TikTok (client-side Excel processing)
    ├── TaskNoteTab.jsx            # Task & Notes (quản lý công việc nội bộ)
    │
    ├── SearchableDropdown.jsx     # Reusable dropdown có search
    ├── DateRangePicker.jsx        # Reusable date range picker
    └── ResizableHeader.jsx        # Reusable resizable table header
```

---

## 3. Authentication & Phân Quyền

### Cách hoạt động
- **Không dùng Supabase Auth** — tài khoản hardcode trong `LoginPage.jsx`
- Session lưu trong `localStorage` (nếu chọn "Ghi nhớ đăng nhập") hoặc `sessionStorage`
- Key session: `sk_session`

### Tài khoản

| Username | Password | Role | Tên hiển thị |
|----------|----------|------|--------------|
| `admin` | `Admin@SK2025` | admin | Admin Tổng |
| `booking` | `Booking@SK2025` | booking | Booking |
| `cs` | `CS@SK2025` | cs | CS |
| `livestream` | `Live@SK2025` | livestream | Livestream |

### Phân quyền xem tab (ROLE_VIEWS)

| View key | admin | booking | cs | livestream |
|----------|-------|---------|----|----|
| `stella_dashboard` | ✅ | ❌ | ❌ | ✅ |
| `cskh` | ✅ | ❌ | ❌ | ❌ |
| `livestream` | ✅ | ❌ | ❌ | ✅ |
| `dashboard` | ✅ | ✅ | ❌ | ❌ |
| `order` | ✅ | ✅ | ✅ | ❌ |
| `booking_performance` | ✅ | ✅ | ❌ | ❌ |
| `contract` | ✅ | ✅ | ❌ | ❌ |
| `airlinks` | ✅ | ✅ | ✅ | ❌ |
| `data_archive` | ✅ | ❌ | ❌ | ❌ |
| `expense` | ✅ | ✅ | ✅ | ✅ |
| `camp_registration` | ✅ | ✅ | ❌ | ❌ |
| `task_notes` | ✅ | ✅ | ✅ | ✅ |

---

## 4. Sidebar Navigation

Sidebar cố định bên trái, rộng `280px`. Các mục được nhóm theo section, mỗi section có thể thu/mở.

```
🛍️  Ecom
    └── Stella Dashboard

📋  CSKH
    └── CSKH

🎬  Livestream
    └── Livestream

📅  Booking
    ├── Dashboard
    ├── Đơn Hàng KOC
    ├── Báo Cáo Hiệu Suất
    ├── Hợp Đồng
    └── Quản Lý Link Air

🗄️  Lưu trữ
    ├── Lưu Trữ Data
    └── Ngân Sách Ecom

🛒  Camp TikTok
    └── Đăng Kí Camp

🛠️  Công Cụ
    └── Task & Notes
```

Dưới sidebar (luôn hiển thị): thông tin user đang đăng nhập + nút Đăng xuất.

---

## 5. Chi Tiết Từng Tab

### 5.1 Stella Dashboard (`StellaDashboardTab`)
- Dashboard tổng quan hiệu suất Ecom (TikTok Shop / sàn)
- Hiển thị charts doanh thu, GMV, đơn hàng bằng Recharts
- Kéo dữ liệu từ Supabase

---

### 5.2 CSKH (`CSKHTab`)
- Tab chăm sóc khách hàng
- Quản lý các vấn đề / ticket từ khách
- Kéo dữ liệu từ Supabase

---

### 5.3 Livestream (`LivestreamTab`)
- Quản lý lịch và kết quả livestream
- Dữ liệu từ Supabase

---

### 5.4 Dashboard Booking (`DashboardTab`)
- Tổng quan booking: doanh thu, chi phí, số đơn theo tháng
- Charts theo brand, nhân sự
- Dữ liệu từ Supabase qua AppDataContext

---

### 5.5 Đơn Hàng KOC (`OrderTab`)
- **Tính năng chính:** Tạo mới và quản lý đơn hàng KOC
- Form tạo đơn: Họ tên, ID kênh, SĐT, địa chỉ, CCCD, brand, sản phẩm, nhân sự, loại ship
- Bảng danh sách đơn: filter đa chiều (kênh, SĐT, brand, sản phẩm, nhân sự, ngày, loại ship)
- Pagination: 50 đơn/trang
- Export Excel, in đơn
- SearchableDropdown dùng cho chọn sản phẩm (dropdown có search, `overflow: visible` để không bị clip)
- **Lưu ý kỹ thuật:** `overflow: 'visible'` phải đặt trên card chứa filter để dropdown không bị cắt

---

### 5.6 Báo Cáo Hiệu Suất (`BookingPerformanceTab`)
- Báo cáo hiệu suất booking theo tháng/năm
- Breakdown theo brand và nhân sự
- **Đặc biệt:** Tab này luôn được mount (không unmount khi đổi tab) để giữ state/cache — dùng `display: none/block` thay vì conditional render
- Dữ liệu từ Supabase

---

### 5.7 Hợp Đồng (`ContractTab`)
- Quản lý hợp đồng với KOC/KOL
- CRUD hợp đồng, filter, export
- Dữ liệu từ Supabase

---

### 5.8 Quản Lý Link Air (`AirLinksTab`)
- Quản lý danh sách link video Air (TikTok) của các KOC
- **Tính năng xóa video trùng:** có bảo vệ bằng password `quockhanh8255`
- **Lưu ý bug đã fix:** Nút "Sửa" từng crash blank page do biến `PRODUCT_OPTIONS` undefined — đã sửa bằng `<input type="text">` thay vì `<select>`
- Pagination: 500 records/trang
- Dữ liệu từ Supabase

---

### 5.9 Lưu Trữ Data (`DataArchiveTab`)
- Lưu trữ và tra cứu dữ liệu lịch sử
- Dữ liệu từ Supabase

---

### 5.10 Ngân Sách Ecom (`ExpenseEcomTab`)
- Theo dõi ngân sách và chi phí Ecom
- Dữ liệu từ Supabase

---

### 5.11 Đăng Kí Camp TikTok (`CampRegistrationTab`)
- **Hoàn toàn client-side** — không cần server, không dùng Supabase
- **Mục đích:** Xử lý đăng ký sản phẩm cho chiến dịch TikTok Shop

#### Cách dùng:
1. Upload **File TikTok gửi** (file template TikTok cấp, có "Tip:" header + nhiều cột)
2. Upload **File giá của mình** (file nội bộ, có "Mẹo:" header + 3 cột: Product ID, SKU ID, Campaign price)
3. Nhấn **Xử lý** → hệ thống so sánh giá và phân loại

#### Logic xử lý (TH1-TH4):
| Trường hợp | Điều kiện | Kết quả |
|-----------|-----------|---------|
| **TH1** | Giá mình (A) ≤ Giá TikTok (B) | Giữ lại, dùng giá A |
| **TH2** | Giá A > Giá B + 1.000đ | Loại bỏ |
| **TH3** | 0 < Giá A - Giá B ≤ 1.000đ | Giữ lại, dùng giá B (quay đầu) |
| **TH4** | Tất cả SKU của 1 Product đều TH2 | Đặc biệt: chọn SKU giá A cao nhất, cần duyệt thủ công |

#### Output Excel:
- Cấu trúc khớp chuẩn TikTok: row 1 = "Mẹo:..." template text, row 2 = headers
- Hàng TH4 được tô màu **vàng (#FFFF00)**
- Font 12pt, headers bold + nền xám nhạt, rows cao hơn mặc định
- Dùng `xlsx-js-style` (không dùng `xlsx` thuần vì không support write styles)

#### Cấu trúc file input:
- **File TikTok:** row 0 = "Tip:" (English), row 1 = headers (Product ID ở col 0, SKU ID ở col 2, Campaign price ở col **6**)
- **File giá:** row 0 = "Mẹo:" (Vietnamese), row 1 = headers (Product ID col 0, SKU ID col 1, Campaign price col 2, Phân loại col 3 optional)
- `readExcelRows(file, 2)` → skip 2 dòng đầu (tip + header) cho cả 2 file

---

### 5.12 Task & Notes (`TaskNoteTab`)
- **Hoàn toàn client-side** — lưu trong `localStorage` với key `sk_task_notes_v2`
- Quản lý task/ghi chú nội bộ cho team

#### Các trường của mỗi task:
| Field | Loại | Mô tả |
|-------|------|-------|
| `title` | string | Tiêu đề (bắt buộc) |
| `desc` | string | Mô tả chi tiết |
| `imgSrc` | base64 string | Ảnh đính kèm |
| `ngayYeuCau` | date string | Ngày yêu cầu (default hôm nay) |
| `deadline` | date string | Deadline |
| `tienDo` | number 0-100 | Tiến độ % |
| `status` | string | Mới / Đang thực hiện / Hoàn thành / Tạm hoãn |

#### Tính năng:
- **Dashboard stats** ở đầu trang: 6 stat cards (Tổng, Mới, Đang làm, Hoàn thành, Tạm hoãn, Quá hạn) + progress bar TB
- **Filter bar** theo status
- **Card grid** — overdue card có viền đỏ
- **Deadline countdown**: Hôm nay 🔥 / Còn N ngày / Quá hạn ⚠️ / Xong ✅
- **Progress bar** per card (cam → xanh khi 100%)
- **Add/Edit modal** với range slider tiến độ
- **Image lightbox** khi click ảnh

---

## 6. AI Chat Floating (`AIChat`)

- Nút chat nổi góc dưới phải màn hình
- Model: **Google Gemini** (`@google/generative-ai`)
- Có quyền truy cập `nhanSus` và `brands` từ AppDataContext để trả lời câu hỏi về dữ liệu
- Cũng có thể query Supabase trực tiếp để tra cứu số liệu

---

## 7. Data Layer

### 7.1 Supabase
- URL và Anon Key lưu trong `.env` (biến `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- Trên Vercel: cấu hình trong Environment Variables của project
- **Không dùng Supabase Auth** — chỉ dùng Supabase làm database

### 7.2 AppDataContext (`src/context/AppDataContext.jsx`)
Global state provider bọc toàn bộ app. Quản lý:
- `brands` — danh sách brand
- `nhanSus` — danh sách nhân sự
- `sanPhams` / `filterSanPhams` — sản phẩm
- Toàn bộ state của OrderTab (form, filters, pagination)
- Report state (tháng, năm, dữ liệu)
- Hàm tiện ích: chuyển số thành chữ tiếng Việt

### 7.3 localStorage Keys

| Key | Dùng bởi | Nội dung |
|-----|----------|---------|
| `sk_session` | App.jsx | Thông tin user đang đăng nhập (JSON) |
| `sk_task_notes_v2` | TaskNoteTab | Mảng task objects |
| `sk_sidebar_notes` | SidebarNotes (deprecated) | Ghi chú cũ trong sidebar |

---

## 8. Môi Trường & Biến Env

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

File `.env` **không được commit** lên GitHub. Trên Vercel đặt trong project settings.

---

## 9. Các Pattern Kỹ Thuật Quan Trọng

### CSS: Dropdown bị clip
Nếu component cha có `overflow: hidden` (ví dụ từ class CSS chung), dropdown `position: absolute` sẽ bị cắt.
**Fix:** Đặt `overflow: 'visible'` inline trên element chứa gần nhất.

### Excel Output Styling
`xlsx` thuần (community 0.18.x) **không support write fill colors**. Phải dùng `xlsx-js-style`:
```js
import * as XLSX from 'xlsx-js-style';
cell.s = { fill: { patternType: 'solid', fgColor: { rgb: 'FFFF00' } } };
XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
```

### BookingPerformanceTab — luôn mounted
Tab này dùng `display: none/block` thay vì unmount để không mất state:
```jsx
<div style={{ display: currentView === 'booking_performance' ? 'block' : 'none' }}>
  <BookingPerformanceTab />
</div>
```

### Theme màu
```js
primary:   '#ea580c'  // orange-600
secondary: '#f59e0b'  // amber-400
gradient:  'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)'
```

---

## 10. Thêm Tab / View Mới

1. Tạo `src/components/TenTabMoi.jsx`
2. Import vào `src/App.jsx`
3. Thêm view key vào group trong sidebar array
4. Thêm render: `{currentView === 'ten_tab_moi' && <TenTabMoi />}`
5. Thêm `'ten_tab_moi'` vào `ROLE_VIEWS` trong `LoginPage.jsx` cho các role được phép

---

## 11. Deploy

```bash
git add .
git commit -m "feat: ..."
git push origin main
# Vercel tự động build và deploy
```

Build command: `vite build` | Output dir: `dist`

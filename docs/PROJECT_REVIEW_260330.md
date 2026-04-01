# 📊 BÁO CÁO DỰ ÁN: KOC Tool - Stella Kinetics

## 🎯 App này làm gì?
Đây là một phần mềm Quản lý Ecom & KOC toàn diện (dùng nội bộ), giúp team thống kê, theo dõi và vận hành từ các chỉ số doanh thu sàn (TikTok Shop, Shopee), hiệu suất quảng cáo (Ads), đến quy trình Booking KOC (hợp đồng, link Affiliate, ngân sách, báo cáo hiệu suất).

## 📁 Cấu trúc chính
```text
📦 src/
 ┣ 📂 components/ (19 files - Chứa toàn bộ các Tab giao diện chức năng)
 ┣ 📂 context/    (AppDataContext.jsx - Lưu trữ dữ liệu chung toàn App)
 ┣ 📂 utils/      (Các hàm helper logic)
 ┣ 📜 App.jsx     (Routing, Sidebar Menu và khung Layout chính)
 ┣ 📜 index.css   (Styling cơ bản & cấu hình Tailwind)
 ┗ 📜 supabaseClient.js (Kết nối backend Supabase)
```

## 🛠️ Công nghệ sử dụng
| Thành phần | Công nghệ |
|------------|-----------|
| Framework | React (v19) + Vite |
| UI/Giao diện | TailwindCSS v4 + Recharts (vẽ biểu đồ) |
| Database/Backend | Supabase |
| Data Processing | SheetJS (xlsx) để export Excel |

## 🚀 Các tính năng đã hoàn thiện (Tổng hợp từ App Menu)

### 🛍️ 1. Module ECOM
- **Stella Dashboard:** Quản trị trung tâm về doanh thu (GMV), Chi phí Ads, Đơn từ Ads, tính toán CPO, ROAS. Báo cáo Tỷ trọng GMV theo sàn, biểu đồ theo nhãn hàng.
- **CSKH (Chăm sóc khách hàng):** Quản lý và xử lý tỉ lệ lỗi, review xấu, khiếu nại của khách.
- **Livestream:** Quản lý hiệu suất, lịch live, GMV của từng phiên livestream.

### 📅 2. Module BOOKING & KOC
- **Dashboard Booking:** Nhìn toàn cảnh số liệu Booking tổng.
- **Đơn Hàng KOC:** Kiểm đếm và quản lý doanh thu từ từng link affiliate/KOC.
- **Báo Cáo Hiệu Suất:** Theo dõi tỷ lệ chuyển đổi, tương tác, hiệu quả chi phí của từng phiên bản KOC được book.
- **Hợp Đồng:** Quản trị hồ sơ và chi tiết thoả thuận với KOC.
- **Quản Lý Link Air:** Tạo, lưu trữ phân phối và tracking Tracking Link.
- **Booking Manager:** Theo dõi tiến độ duyệt yêu cầu book, trạng thái video, thanh toán KOC.

### 🗄️ 3. Module LƯU TRỮ (Archive)
- **Lưu Trữ Data:** Giao diện tra cứu và đồng bộ lượng dữ liệu cũ.
- **Ngân Sách Ecom:** Dashboard theo dõi luồng tiền chi ra (Expense) cho các hạng mục vận hành sàn.

## 🚀 Cách chạy dự án
```bash
npm install
npm run dev
# App đang chạy tại cổng http://localhost:5173
```

# 📋 TIẾN ĐỘ & BÀN GIAO — KOC Tool (Stella Kinetics)

> File này tóm tắt **đã làm gì / đang dở gì / cách tiếp tục**. Cập nhật: 2026-06-11.
> **Lịch sử làm việc chi tiết = lịch sử Git** (mỗi lần sửa là 1 commit). Xem bằng: `git log --oneline`.

---

## 1. Tổng quan
- **App:** Dashboard nội bộ quản lý vận hành TMĐT (TikTok Shop + Shopee) cho Stella Kinetics.
- **Stack:** React 19 + Vite + TailwindCSS v4 + Supabase + SheetJS. Backend = serverless functions trong `api/`.
- **Deploy:** Vercel (Hobby — **tối đa 12 file API**, đừng thêm file mới trong `api/`, gộp vào file có sẵn).
- **Domain:** `stellakinetics.space` + `koc-tool.vercel.app` (tool nội bộ) · `appcash.app` (web công ty công khai cho TikTok Business API).
- **Repo:** https://github.com/vuongkhanh8255-ux/orderdonkoc.git
- **Supabase:** project `xkyhvcmnkrxdtmwtghln` (ap-southeast-1).
- **Quy trình:** sửa code → `git commit` → `git push` → **Vercel tự deploy** (~1-2 phút). Sửa DB qua Supabase migration.

---

## 2. ĐÃ LÀM (gần đây)

### 🌟 Hiệu suất KOC (`src/components/KocPerformanceTab.jsx`)
- Cột **View** = view PHÁT SINH theo kỳ (view-tháng), scale theo khoảng ngày. Cột **Cast** (chi phí booking), **ROAS** = GMV/(hoa hồng+cast), tách **Video tổng / Video kỳ**.
- **Phân trang** 20 dòng/trang (đổi 10/20/50/100). **Date picker** gọn + lịch popup.
- **Tăng tốc:** cache phiên (trình duyệt) + cache chung server (`koc_orders_cache`) + index → "Tất cả" từ ~2.1s xuống ~0.8s. Auto-retry khi lỗi tạm thời lúc deploy.
- **🏷️ ĐỊNH DANH KOC** (gán nhân sự quản lý theo brand) — dùng chung bảng `koc_brand_assignments` với Dashboard booking:
  - Panel thẻ riêng (viền cam), chỉ hiện brand đang mở.
  - Admin gán = duyệt luôn 🟢 · Ecom đề xuất 🟡 → **admin duyệt** (panel "🔔 đề xuất GÁN chờ duyệt").
  - **Lịch sử** (`koc_assignment_history`) — log mọi gán/đề xuất/duyệt/gỡ.
  - **Rule 45 ngày 0 video** → đề xuất gỡ (panel "🗑️ chờ duyệt"). **KOC blacklist** → card đỏ + admin duyệt gỡ.
  - Lọc "🔎 chỉ KOC chưa định danh" để gán nhanh.

### ⭐ Đánh giá sàn (`src/components/ReviewsTab.jsx`)
- Lọc Shopee/TikTok + khoảng ngày (client-side, tức thì). Thống kê theo **Brand** + card "⚠️ Cần xử lý".
- Hiện **mã đơn + user id** trong chi tiết review. Bỏ shop SPA + FBS. Fix lọc sao (ép kiểu số).

### ⚡ Flash Sale (`src/components/FlashSaleTab.jsx`)
- **Nhập Excel** → tự tick SP + điền giá (khớp item_id/model_id) + lưu mẫu tái dùng (`flash_sale_templates`).
- **Auto-FS hằng ngày** (cron 2h sáng) + panel "Lịch sử Auto Flash Sale" (`fs_auto_log`).

### Khác
- **Thanh toán KOC** (tab mới): bắt buộc Link Air + upload ảnh CCCD/hợp đồng (gallery nhiều ảnh).
- **Black List KOC**: tab riêng, chỉ admin.
- **Hợp đồng**: sửa MST công ty → **0309391133**.
- **Giao diện**: cam tươi `#ff6a2c` toàn app + sidebar gradient cam.
- **Tài khoản Minh Thư** (role `assistant`): full trừ Giá Cost.

### 🔒 Bảo mật
- **ĐÃ VÁ (quan trọng):** giấu cột token (`access_token`/`refresh_token`/`raw_response`/`last_auth_code`) khỏi vai trò `anon` trên 5 bảng connection → token TikTok/Shopee không lộ qua API công khai nữa. Frontend lọc theo `access_token_expires_at`.

---

## 3. ĐANG DỞ / TODO
- **📊 ROAS — đổi công thức (yêu cầu sếp 11/06):** `ROAS = GMV / (Chi phí AFF + Chi phí CAST + CHI PHÍ MẪU)`.
  - Hiện đang là `GMV / (aff + cast)`. Cần cộng thêm **chi phí mẫu** (tiền hàng mẫu gửi KOC).
  - **"Chi phí mẫu" CHƯA có cách tính** → sẽ bàn + code sau. Vị trí sửa: hàm `roasOf` trong `src/components/KocPerformanceTab.jsx` (đã có comment 📌 TODO ở đó).
- **🔒 Bảo mật RLS toàn diện** (lớn, chưa làm): 19 bảng còn tắt RLS → ai có anon key vẫn đọc/sửa data. Cần đưa thao tác DB của frontend về backend (service key) HOẶC thêm Supabase Auth + policy. Làm dần từng nhóm bảng, test kỹ.
- **Storage buckets** (2 bucket cho liệt kê công khai) — tắt.
- **Re-authorize kết nối TikTok** (phòng token đã lộ trước khi vá).
- **TikTok Business API:** đổi Company Website → `https://appcash.app` cho khớp email (để hết bị reject) — việc thủ công bên TikTok.
- **eHerb Mp / eHerb Mall (Shopee):** chưa có trong ERP đánh giá → cần kết nối vào `stella-erp.autotool.click`.
- **Shopee SPX:** đã gửi info ADO (~50 đơn/ngày) chờ Shopee setup.

---

## 4. 🖥️ SETUP MÁY MỚI (từng bước)
1. **Cài công cụ:** [Git](https://git-scm.com), [Node.js LTS](https://nodejs.org) (đang dùng **v22**), [VS Code](https://code.visualstudio.com) hoặc Cursor.
2. **Tải code về:** mở terminal (PowerShell), chạy:
   ```
   git clone https://github.com/vuongkhanh8255-ux/orderdonkoc.git koc-tool
   cd koc-tool
   ```
3. **Bỏ lại file env:** giải nén `ENV_BACKUP.zip` → copy các file `koc-tool__*.env*` vào thư mục `koc-tool`, **đổi tên** về đúng: `.env`, `.env.production`, `.env.vercel`.
4. **Cài thư viện:** `npm install`
5. **Chạy thử:** `npm run dev` → mở link localhost. (App thật chạy trên Vercel, không cần chạy local cũng được.)
6. **Đăng nhập GitHub** (để push): cài [GitHub Desktop](https://desktop.github.com) cho dễ, hoặc `git` CLI.

> ✅ **Lịch sử làm việc tự động theo qua máy mới** nhờ Git — sau khi clone, gõ `git log --oneline` là thấy hết mọi thay đổi đã làm.

---

## 5. Lưu ý vận hành
- **Đừng** thêm file mới trong `api/` (kịch trần 12 function Vercel) — gộp action vào file có sẵn.
- Đổi DB: dùng Supabase migration (thư mục `migrations/`).
- Sửa xong: `git add <file cụ thể>` → `git commit` → `git push` → Vercel tự deploy.
- Có 1 "agent ads" làm song song cùng repo → `git add` từng file của mình, đừng `-A`.

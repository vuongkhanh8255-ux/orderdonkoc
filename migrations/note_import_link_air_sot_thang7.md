# 23/7/2026 — Nạp "LINK AIR SÓT THÁNG 7.xlsx" (5 tab) → air_links

**Kết quả: nạp 894 link / 925 dòng có link.** Bỏ 30 (đã có sẵn) + 1 (trùng trong file).

Phân bổ lớn nhất: Trúc Quỳnh/MOAW 156 · Tường Vi/EHERB 89 · Tường Vi/MILAGANICS 75 ·
Ngọc Mai/MILAGANICS 66 · Hữu Đan/HEALMI 65 · Tường Vi/MOAW 61 · Nguyên Bảo/MOAW 58 ·
Tường Vi/EHERB HCM 56 · Hoàng Vũ/EHERB 48.

## Bất thường phát hiện trước khi nạp

1. **65 link của Hữu Đan nằm nhầm tab.** Nằm ở tab "EHERB VN" nhưng cột Brand ghi `HEALMII`;
   đối chiếu `tiktok_shop_videos` → đúng là video của shop **HEALMI**. → nạp vào brand HEALMI
   (nếu nạp theo tên tab thì GMV eHerb bị thổi ảo 65 video).
2. **30 link đã có sẵn trong hệ thống** — toàn bộ của Trúc Quỳnh (29 MOAW + 1 MILAGANICS).
   Bỏ qua để không đếm đôi.
3. **1 video trùng giữa 2 tab**: `@shopcuanhim_/7660521889617448213` — tab EHERB VN ghi Hoàng Vũ,
   tab MILAGANICS ghi Nguyên Bảo. Video thuộc shop **EHERB VN** → giữ dòng Hoàng Vũ, bỏ dòng Nguyên Bảo.
4. **9 link KOC đang là tag của người khác** (vẫn nạp theo file, chỉ note):
   - Tường Vi lấy KOC tag Lưu Hằng: @calemthichunbox, @miariviuu, @thuu.daily97
   - Minh Thảo ← tag Lưu Hằng: @mohon_haman | Trúc Quỳnh ← tag Nguyên Bảo: @mohon_haman
   - Ngọc Mai ← tag Tường Vi: @n.thao802 | Tường Vi ← tag Ngọc Mai: @ngocgiauhakieuanh
   - Hữu Đan ← tag Hoàng Vy: @nhyee512 (2 link)
5. **Video air LÂU (không phải tháng 7)**: 2 video tháng 5 — @aluongreviewdo 5/5 (Thu Thảo, MOAW),
   @tututhichreview 21/5 (Tường Vi, EHERB); 37 video cuối tháng 6 (đa số 30/6, sát mốc).
6. **9 video chưa thấy trong shop nào của mình** (sync chưa kịp / có thể không gắn SP shop mình):
   BODYMISS d4 @comaine1 · MOAW d54 @bosua.nam (air 25/6, đáng ngờ nhất) ·
   MILAGANICS d108-113 (@trinhchin1720, @titne245, @mohon_haman, @trangngaongo26, @rutong167) ·
   MILAGANICS d158 @__huyentrangpham · d182 @em.b.yumii.
7. **538/925 link là KOC CHƯA CÓ TAG** brand đó — bình thường với link air, nhưng nghĩa là
   phần lớn công này không được ghi nhận qua tag, chỉ tính qua link air.
8. Toàn bộ file **không điền Cast, không điền CMS, gần như không điền ngày air** →
   ngày air lấy từ `tiktok_shop_videos.post_date`, thiếu thì suy từ ID video (timestamp, giờ VN).

# 📦 Workflow nạp & sync data KOC cho 1 gian hàng (TikTok)

> Đóng gói từ việc đã làm cho **Bodymiss** (24–25/6/2026). Áp dụng **Y CHANG** cho các gian sau:
> Milaganics → Moaw Moaws → eHerb HCM → eHerb VN. **Không chế thêm logic.**

---

## 0. Tab "Hiệu suất KOC" đo gì & data nằm đâu

- **Đơn / GMV / Hoa hồng**: từ `tiktok_affiliate_orders` (sync API affiliate, cron riêng).
- **Tổng video / Video kỳ này**: đếm từ `tiktok_shop_videos` (mỗi video 1 dòng, có `post_date`).
  - "Video kỳ này" = video **đăng trong kỳ** (đếm theo `post_date` nằm trong khoảng chọn).
- **Tổng view / cột VIEW per-KOC**: từ `tiktok_video_monthly_views` (mỗi video × mỗi tháng = 1 dòng
  "view **phát sinh trong tháng đó**" — KHÔNG cộng dồn lũy kế). Chọn kỳ nào thì cộng các tháng trong kỳ.
- **Gian "full"**: shop_id nằm trong bảng `koc_full_video_shops` **và** trong Set `VIDEO_FULL_SHOPS`
  (file `api/tiktok-shop/analytics.js`). Gian full = đếm **TẤT CẢ** video (bỏ lọc view≥100), khớp số TikTok.

### RPC dùng (đều SECURITY DEFINER nên anon gọi được, bỏ qua RLS)
| RPC | Việc | Cơ chế chống hỏng |
|---|---|---|
| `upsert_shop_videos_max(p_rows)` | ghi `tiktok_shop_videos` (đếm video + post_date + view-snapshot) | view/gmv/đơn = **GREATEST** (chỉ tăng); post_date/username/title/SP = **coalesce(mới, cũ)** → giá trị mới rỗng **KHÔNG** đè cũ |
| `upsert_video_month_min(p_rows)` | ghi `tiktok_video_monthly_views` (view-tháng) | views = **GREATEST** |
| `koc_video_views` / `koc_video_views_total` / `koc_perf_extra_totals` | tính per-KOC + tổng | chỉ trả creator-có-đơn (<1000 dòng, né PostgREST cắt) |

---

## 1. Quy trình nạp 1 gian (4 bước)

**Cần:** file Excel TikTok **"Video Performance List"** của gian (Seller Center → Phân tích → Video → Xuất),
và **TikTok shop_id** của gian (xem mục 3).

### Bước 1+2 — Nạp Excel (1 lệnh, ghi CẢ 2 bảng)
```bash
node scripts/import-koc-video-full.cjs "<đường-dẫn.xlsx>" <tiktok_shop_id> 2026-06
```
Script tự: dedupe theo ID video (view=max VV, gmv/đơn=cộng, post_date từ cột "Thời gian"), rồi đẩy qua
`upsert_shop_videos_max` **và** `upsert_video_month_min`. **Bỏ bước (2) → VIEW per-kỳ = 0.**

### Bước 3 — Đăng ký gian "full" (bảng DB)
```sql
insert into koc_full_video_shops (shop_id) values ('<tiktok_shop_id>') on conflict do nothing;
```

### Bước 4 — Đăng ký gian "full" (code) + xóa cache
- Thêm shop_id vào Set `VIDEO_FULL_SHOPS` trong `api/tiktok-shop/analytics.js` (dòng ~455).
- Xóa cache: `delete from koc_orders_cache where cache_key like '<tiktok_shop_id>%';`
- Commit + push (Vercel auto-deploy). Bút commit phải email `vuongkhanh8255@gmail.com`.

### Dò số (bắt buộc, sau khi nạp)
```sql
select
 (select count(*) from tiktok_shop_videos where shop_id='<id>' and post_date>='2026-06-01' and post_date<='2026-06-25') posted_jun,
 (select coalesce(sum(views),0) from tiktok_video_monthly_views where shop_id='<id>' and ym='2026-06') view_jun;
```
So với Excel: **DB phải ≈ hoặc ≥ Excel** (DB cao hơn chút vì API đã merge GREATEST). Lệch nhiều → soi lại.

---

## 2. Test đúng cách (đừng tự lừa mình)

- **Test bằng đúng đường app** (gọi API endpoint / mở web), **KHÔNG** test bằng SQL editor quyền admin —
  admin bỏ qua RLS **và** không bị PostgREST cắt 1000 dòng → che mất bug. App dùng **service role**.
- Sau deploy: **Ctrl+F5** (hoặc cửa sổ ẩn danh) kẻo dính cache trình duyệt.

---

## 3. TikTok shop_id các gian

| Gian | shop_id | Trạng thái |
|---|---|---|
| Body Miss Việt Nam | `7495107349171898427` | ✅ xong |
| Milaganics Việt Nam | `7494813818973817115` | ✅ xong |
| Moaw Moaws Việt Nam | `7495831977917385095` | ✅ xong |
| eHerb Hồ Chí Minh | `7495838925500090511` | ⏳ chờ Excel |
| eHerb Viet Nam | `7494529979361168222` | ⏳ chờ Excel |
| Healmii Việt Nam | `7494251668499498533` | (chưa làm) |

---

## 4. Bài học / bẫy đã gặp (đừng lặp)

1. **VIEW = view phát sinh trong tháng, KHÔNG lũy kế.** Nguồn `tiktok_video_monthly_views` (delta từng tháng).
   Kiểm: 1 video xem qua các tháng phải **lên/xuống** được (lũy kế thì luôn tăng).
2. **Nạp Excel phải ghi CẢ 2 bảng** (video + view-tháng). Quên view-tháng → card Tổng view thiếu, per-KOC = 0.
3. **Bug wipe post_date:** sync `.upsert` thẳng từng làm rỗng `post_date` khi API trả thiếu ngày → "Video kỳ"
   tụt qua đêm. Đã fix: mọi ghi metadata đi qua `upsert_shop_videos_max` (coalesce giữ cũ). **Đừng `.upsert`
   thẳng `tiktok_shop_videos` nữa.**
4. **PostgREST cắt 1000 dòng:** RPC trả mảng > 1000 → KOC ngoài top bị view=0. `koc_video_views` chỉ trả
   creator-có-đơn (<1000) để né.
5. **RLS bật, không policy:** app chạy được nhờ **service role**. Nếu thêm chỗ gọi RPC không qua API → ra 0.
6. **Đèn báo tự kiểm** (dưới card Tổng view): 🟢 = data tháng còn tươi (cron sống); 🟡 = lâu chưa cập nhật,
   nghi sync đứng → số có thể thiếu, bấm Tải lại / kiểm cron.

---

## 5. Sau khi nạp xong, data tự nuôi thế nào

Không cần nạp Excel lại. Cron (cron-job.org) gọi sync API liên tục → `upsert_shop_videos_max` +
view-tháng tự cập nhật, **GREATEST nên không tụt**. Excel chỉ là cú "tua nhanh" 1 lần cho đủ đuôi dài.
Muốn đối chiếu tay: TikTok Seller Center → Phân tích → Video → chọn 1 tháng → so tổng view với card (cùng nguồn).

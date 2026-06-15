-- Sửa "Lỗi đếm Link Air: statement timeout" (Module 5 Quản lý Link Air).
-- air_links (~80k dòng) chỉ có PK -> sort phân trang phải seq scan + sort cả bảng
--   (~105ms/trang), và count exact quét cả bảng. Khi DB bận (backfill ~500k đơn affiliate)
--   các query này vượt 8s -> timeout.
-- Sửa: (1) thêm index sort + lọc -> phân trang dùng index (105ms -> 5ms/trang);
--      (2) code đổi count 'exact' -> 'estimated' (không quét cả bảng).
-- Đã apply trực tiếp lên DB 2026-06-15 + ANALYZE air_links.

CREATE INDEX IF NOT EXISTS idx_air_links_created_id ON air_links (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_air_links_ngay_air   ON air_links (ngay_air);
CREATE INDEX IF NOT EXISTS idx_air_links_brand      ON air_links (brand_id);
CREATE INDEX IF NOT EXISTS idx_air_links_nhansu     ON air_links (nhansu_id);
ANALYZE air_links;

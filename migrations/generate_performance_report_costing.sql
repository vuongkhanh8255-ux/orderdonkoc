-- BÁO CÁO HIỆU SUẤT NHÂN SỰ — đổi cách tính CHI PHÍ.
-- TRƯỚC: chi_phi_tong = Σ(sanphams.gia_tien × SL)  (giá lưu thẳng trong bảng sanphams).
-- NAY:   lấy barcode sản phẩm → đối chiếu FILE GIÁ GỐC (costing_data, cột "COSTING T... AMIS V2"
--        tháng MỚI NHẤT, tự dò) → ra giá gốc → áp công thức PER ĐƠN:
--          Σ(giá_gốc × 1.08 × SL)  [Cost + VAT 8%]
--          + 5.000                 [vận hành / đơn]
--          + ship (Hỏa tốc 50.000 / Thường 20.000) [vận chuyển / đơn]
--        chi_phi_tong (mỗi nhân sự) = cộng tất cả đơn trong tháng.
--        aov_don_order = chi_phi_tong / số đơn.
-- Map: sanphams.barcode ↔ costing_data "Mã" (giống hàm koc_sample_cost đã duyệt).
-- LƯU Ý: đơn không có chitiettonguis (thiếu barcode) vẫn được tính 5.000 + ship,
--        nhưng phần hàng = 0 (vì không tra được giá gốc). sl_order vẫn đếm đủ mọi đơn.
CREATE OR REPLACE FUNCTION public.generate_performance_report(target_month integer, target_year integer)
 RETURNS TABLE(nhansu_id uuid, ten_nhansu text, sl_order bigint, chi_phi_tong numeric, aov_don_order numeric, brand_counts jsonb)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  -- Lấy cột "AMIS V2" THÁNG MỚI NHẤT (vd: COSTING T3.2026 AMIS V2), KHÔNG dùng cột "...file".
  WITH latest_col AS (
    SELECT h AS col FROM costing_data, jsonb_array_elements_text(headers) h
    WHERE h LIKE 'COSTING T% AMIS V2'
    ORDER BY (regexp_match(h, 'T(\d+)\.(\d+) AMIS V2'))[2]::int DESC,
             (regexp_match(h, 'T(\d+)\.(\d+) AMIS V2'))[1]::int DESC
    LIMIT 1
  ),
  -- Ô có chữ (vd "CHƯA SẢN XUẤT") → coi như chưa có giá (NULL), không làm lỗi.
  cost_map AS (
    SELECT r->>'Mã' AS barcode,
           CASE WHEN trim(replace((r->>lc.col), ',', '')) ~ '^[0-9]+(\.[0-9]+)?$'
                THEN trim(replace((r->>lc.col), ',', ''))::numeric
                ELSE NULL END AS cost
    FROM costing_data cd, latest_col lc, jsonb_array_elements(cd.rows) r
    WHERE cd.key = 'latest'
  ),
  -- Mỗi đơn: tổng tiền hàng (giá gốc × 1.08 × SL) + 5.000 vận hành + ship theo loại.
  per_order AS (
    SELECT dg.id,
           dg.nhansu_id,
           COALESCE(SUM(cm.cost * 1.08 * ctg.so_luong), 0)
             + 5000
             + CASE WHEN dg.loai_ship = 'Hỏa tốc' THEN 50000 ELSE 20000 END AS order_total
    FROM donguis dg
    LEFT JOIN chitiettonguis ctg ON ctg.dongui_id = dg.id
    LEFT JOIN sanphams sp ON ctg.sanpham_id = sp.id
    LEFT JOIN cost_map cm ON cm.barcode = sp.barcode
    WHERE EXTRACT(MONTH FROM dg.ngay_gui) = target_month
      AND EXTRACT(YEAR  FROM dg.ngay_gui) = target_year
    GROUP BY dg.id, dg.nhansu_id, dg.loai_ship
  ),
  ns_cost AS (
    SELECT po.nhansu_id        AS ns_id,
           COUNT(*)            AS sl_order,
           SUM(po.order_total) AS chi_phi_tong
    FROM per_order po
    GROUP BY po.nhansu_id
  ),
  -- Số đơn theo brand (không đổi so với bản cũ).
  ns_brand AS (
    SELECT t.nhansu_id AS ns_id,
           jsonb_object_agg(t.ten_brand, t.brand_count) AS brand_counts
    FROM (
      SELECT dg2.nhansu_id, b2.ten_brand,
             COUNT(DISTINCT ctg2.dongui_id) AS brand_count
      FROM donguis dg2
      JOIN chitiettonguis ctg2 ON ctg2.dongui_id = dg2.id
      JOIN sanphams sp2 ON ctg2.sanpham_id = sp2.id
      JOIN brands b2 ON sp2.brand_id = b2.id
      WHERE EXTRACT(MONTH FROM dg2.ngay_gui) = target_month
        AND EXTRACT(YEAR  FROM dg2.ngay_gui) = target_year
      GROUP BY dg2.nhansu_id, b2.ten_brand
    ) t
    GROUP BY t.nhansu_id
  )
  SELECT
    ns.id AS nhansu_id,
    ns.ten_nhansu,
    COALESCE(nc.sl_order, 0)      AS sl_order,
    COALESCE(nc.chi_phi_tong, 0)  AS chi_phi_tong,
    CASE WHEN COALESCE(nc.sl_order, 0) > 0
         THEN nc.chi_phi_tong / nc.sl_order
         ELSE 0 END               AS aov_don_order,
    COALESCE(nb.brand_counts, '{}'::jsonb) AS brand_counts
  FROM nhansu ns
  LEFT JOIN ns_cost  nc ON nc.ns_id = ns.id
  LEFT JOIN ns_brand nb ON nb.ns_id = ns.id;
END;
$function$;

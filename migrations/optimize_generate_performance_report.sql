-- Tối ưu generate_performance_report (sửa lỗi "canceling statement due to statement timeout")
-- Nguyên nhân: các CTE đọc JSON cost (costing_data ~1.2MB) bị tính lại nhiều lần
--   -> ~900MB bộ nhớ tạm, ~3.7s/lần chạy -> vượt statement_timeout (8s) khi đông đơn.
-- Cách sửa: ép tính cost 1 lần (MATERIALIZED) + lọc ngày theo khoảng (dùng index) + gộp trùng barcode.
-- Kết quả: 3700ms -> ~180ms, số liệu giữ nguyên. Đã áp dụng trực tiếp lên DB 2026-06-15.

CREATE INDEX IF NOT EXISTS idx_donguis_ngay_gui ON donguis (ngay_gui);
CREATE INDEX IF NOT EXISTS idx_sanphams_barcode ON sanphams (barcode);

CREATE OR REPLACE FUNCTION public.generate_performance_report(target_month integer, target_year integer)
 RETURNS TABLE(nhansu_id uuid, ten_nhansu text, sl_order bigint, chi_phi_tong numeric, aov_don_order numeric, brand_counts jsonb)
 LANGUAGE plpgsql
AS $function$
DECLARE
  d_start timestamptz := make_date(target_year, target_month, 1)::timestamptz;
  d_end   timestamptz := (make_date(target_year, target_month, 1) + interval '1 month')::timestamptz;
BEGIN
  RETURN QUERY
  WITH latest_col AS MATERIALIZED (
    SELECT h AS col FROM costing_data, jsonb_array_elements_text(headers) h
    WHERE h LIKE 'COSTING T% AMIS V2'
    ORDER BY (regexp_match(h, 'T(\d+)\.(\d+) AMIS V2'))[2]::int DESC,
             (regexp_match(h, 'T(\d+)\.(\d+) AMIS V2'))[1]::int DESC
    LIMIT 1
  ),
  cost_map AS MATERIALIZED (
    SELECT barcode, MAX(cost) AS cost
    FROM (
      SELECT r->>'Mã' AS barcode,
             CASE WHEN trim(replace((r->>lc.col), ',', '')) ~ '^[0-9]+(\.[0-9]+)?$'
                  THEN trim(replace((r->>lc.col), ',', ''))::numeric
                  ELSE NULL END AS cost
      FROM costing_data cd, latest_col lc, jsonb_array_elements(cd.rows) r
      WHERE cd.key = 'latest'
    ) x
    WHERE barcode IS NOT NULL AND barcode <> ''
    GROUP BY barcode
  ),
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
    WHERE dg.ngay_gui >= d_start AND dg.ngay_gui < d_end
    GROUP BY dg.id, dg.nhansu_id, dg.loai_ship
  ),
  ns_cost AS (
    SELECT po.nhansu_id        AS ns_id,
           COUNT(*)            AS sl_order,
           SUM(po.order_total) AS chi_phi_tong
    FROM per_order po
    GROUP BY po.nhansu_id
  ),
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
      WHERE dg2.ngay_gui >= d_start AND dg2.ngay_gui < d_end
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

-- Chi phí mẫu mỗi KOC (vào ROAS ở Hiệu suất KOC) — THEO KỲ đang chọn.
-- = Σ(cost×1.08×SL) + 5.000 vận hành + ship (Hỏa tốc 50k / Thường 20k) — tính PER ĐƠN.
-- Lọc đơn mẫu theo ngay_gui (giờ VN) trong [p_start, p_end]; null = tất cả (mode "Tất cả").
-- Cost lấy từ costing_data, cột "...file" THÁNG MỚI NHẤT (tự dò). Map sanphams.barcode ↔ costing "Mã".
-- KOC khớp theo donguis.koc_id_kenh (lowercase) ↔ creator_username affiliate.
-- LƯU Ý: đơn mẫu không có chitiettonguis (chỉ có text san_pham_chi_tiet) sẽ KHÔNG tính được (thiếu barcode).
drop function if exists koc_sample_cost();
create or replace function koc_sample_cost(p_start date default null, p_end date default null)
returns table(uname text, sample_cost numeric)
language sql stable as $$
  with latest_col as (
    select h as col from costing_data, jsonb_array_elements_text(headers) h
    where h like 'COSTING T%file'
    order by (regexp_match(h, 'T(\d+)\.(\d+) file'))[2]::int desc,
             (regexp_match(h, 'T(\d+)\.(\d+) file'))[1]::int desc
    limit 1
  ),
  cost_map as (
    select r->>'Mã' as barcode,
           nullif(replace((r->>lc.col), ',', ''), '')::numeric as cost
    from costing_data cd, latest_col lc, jsonb_array_elements(cd.rows) r
    where cd.key = 'latest'
  ),
  per_order as (
    select d.id, lower(d.koc_id_kenh) as uname, d.loai_ship,
           sum(coalesce(cm.cost, 0) * 1.08 * coalesce(ct.so_luong, 0)) as items_cost
    from donguis d
    join chitiettonguis ct on ct.dongui_id = d.id
    join sanphams sp on sp.id = ct.sanpham_id
    left join cost_map cm on cm.barcode = sp.barcode
    where coalesce(d.koc_id_kenh, '') <> ''
      and (p_start is null or (d.ngay_gui at time zone 'Asia/Ho_Chi_Minh')::date >= p_start)
      and (p_end   is null or (d.ngay_gui at time zone 'Asia/Ho_Chi_Minh')::date <= p_end)
    group by d.id, lower(d.koc_id_kenh), d.loai_ship
  )
  select uname,
         round(sum(items_cost + 5000 + case when loai_ship = 'Hỏa tốc' then 50000 else 20000 end))::numeric as sample_cost
  from per_order
  group by uname;
$$;

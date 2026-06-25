-- FIX 25/6/2026: mã vạch sản phẩm (sanphams.barcode) hay dính TAB/khoảng trắng ở đuôi → khớp HỤT bảng giá
-- AMIS V2 → giá vốn = 0 → chi phí mẫu thiếu. Có 21 SP (mọi brand) bị, tất cả đều CÓ giá nếu bỏ whitespace.
-- Chuẩn hóa mã (xóa mọi khoảng trắng) ở CẢ 2 phía khi join. Logic khác giữ NGUYÊN.
create or replace function public.koc_sample_cost(p_start date default null, p_end date default null, p_brand text default null)
returns table(uname text, sample_cost numeric)
language sql stable set statement_timeout to '20s'
as $function$
  with latest_col as (
    select h as col from costing_data, jsonb_array_elements_text(headers) h
    where h like 'COSTING T% AMIS V2'
    order by (regexp_match(h, 'T(\d+)\.(\d+) AMIS V2'))[2]::int desc,
             (regexp_match(h, 'T(\d+)\.(\d+) AMIS V2'))[1]::int desc
    limit 1
  ),
  cost_map as (
    select regexp_replace(r->>'Mã', '\s', '', 'g') as barcode,
           case when trim(replace((r->>lc.col), ',', '')) ~ '^[0-9]+(\.[0-9]+)?$'
                then trim(replace((r->>lc.col), ',', ''))::numeric else null end as cost
    from costing_data cd, latest_col lc, jsonb_array_elements(cd.rows) r
    where cd.key = 'latest'
  ),
  per_order as (
    select d.id, lower(d.koc_id_kenh) as uname, d.loai_ship,
           sum(coalesce(cm.cost, 0) * 1.08 * coalesce(ct.so_luong, 0)) as items_cost
    from donguis d
    join chitiettonguis ct on ct.dongui_id = d.id
    join sanphams sp on sp.id = ct.sanpham_id
    left join brands b on b.id = sp.brand_id
    left join cost_map cm on cm.barcode = regexp_replace(coalesce(sp.barcode,''), '\s', '', 'g')
    where coalesce(d.koc_id_kenh, '') <> ''
      and (p_start is null or (d.ngay_gui at time zone 'Asia/Ho_Chi_Minh')::date >= p_start)
      and (p_end   is null or (d.ngay_gui at time zone 'Asia/Ho_Chi_Minh')::date <= p_end)
      and (p_brand is null or
           upper(regexp_replace(regexp_replace(coalesce(b.ten_brand,''),'\s*HCM\s*$','','i'),'[^A-Za-z0-9]','','g'))
         = upper(regexp_replace(regexp_replace(p_brand,'\s*HCM\s*$','','i'),'[^A-Za-z0-9]','','g')))
    group by d.id, lower(d.koc_id_kenh), d.loai_ship
  )
  select uname,
         round(sum(items_cost + 5000 + case when loai_ship = 'Hỏa tốc' then 50000 else 20000 end))::numeric as sample_cost
  from per_order
  group by uname;
$function$;
grant execute on function public.koc_sample_cost(date,date,text) to anon, authenticated;

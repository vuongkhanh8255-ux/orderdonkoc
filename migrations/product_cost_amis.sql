-- 2/7/2026 — cost GỐC (AMIS V2, cột mới nhất) theo barcode, cho Xuất Shopee Express: giá trị khai báo = cost×5.
-- Cùng nguồn cost với report_sample_cost (khớp Module chi phí mẫu). Trả cost THÔ (chưa ×1.08/+5k/+ship).
create or replace function public.product_cost_amis()
returns table(barcode text, cost numeric)
language sql stable security definer set search_path to 'public' set statement_timeout to '20s'
as $function$
  with latest_col as (
    select h as col from costing_data, jsonb_array_elements_text(headers) h where h like 'COSTING T% AMIS V2'
    order by (regexp_match(h,'T(\d+)\.(\d+) AMIS V2'))[2]::int desc,(regexp_match(h,'T(\d+)\.(\d+) AMIS V2'))[1]::int desc limit 1)
  select regexp_replace(r->>'Mã','\s','','g') as barcode,
      max(case when trim(replace((r->>lc.col),',',''))~'^[0-9]+(\.[0-9]+)?$' then trim(replace((r->>lc.col),',',''))::numeric else null end) as cost
  from costing_data cd, latest_col lc, jsonb_array_elements(cd.rows) r where cd.key='latest'
  group by 1;
$function$;
grant execute on function public.product_cost_amis() to anon, authenticated;

-- #5 Cảnh báo liên hệ KOC: 1 ID kênh gắn >=3 SĐT, hoặc 1 SĐT gắn >=3 ID kênh (rà bảng donguis)
create or replace function public.koc_phone_channel_warnings()
returns jsonb language sql stable set statement_timeout to '15s'
as $function$
  with base as (
    select nullif(trim(koc_id_kenh),'') as id_kenh, nullif(trim(koc_sdt),'') as sdt
    from donguis
    where nullif(trim(koc_id_kenh),'') is not null
      and trim(koc_sdt) ~ '^[0-9]{9,12}$'   -- chỉ tính giá trị THẬT là số điện thoại, bỏ qua "HỦY ĐƠN"...
  ),
  kenh_nhieu_sdt as (
    select id_kenh, count(distinct sdt) as so_sdt, array_agg(distinct sdt) as ds_sdt
    from base group by id_kenh having count(distinct sdt) >= 3
  ),
  sdt_nhieu_kenh as (
    select sdt, count(distinct id_kenh) as so_kenh, array_agg(distinct id_kenh) as ds_kenh
    from base group by sdt having count(distinct id_kenh) >= 3
  )
  select jsonb_build_object(
    'kenh_nhieu_sdt', coalesce((select jsonb_agg(jsonb_build_object('id_kenh', id_kenh, 'so_sdt', so_sdt, 'ds_sdt', ds_sdt) order by so_sdt desc) from kenh_nhieu_sdt), '[]'::jsonb),
    'sdt_nhieu_kenh', coalesce((select jsonb_agg(jsonb_build_object('sdt', sdt, 'so_kenh', so_kenh, 'ds_kenh', ds_kenh) order by so_kenh desc) from sdt_nhieu_kenh), '[]'::jsonb)
  );
$function$;

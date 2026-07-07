-- Link air của 1 nhân sự (cho Báo cáo nhân sự) — join brand + trạng thái on-air.
-- Phân trang + tìm kiếm PHÍA SERVER (né trần 1000 rows PostgREST; NS có thể vài chục nghìn link) + tổng thật.
drop function if exists public.staff_air_links(uuid,date,date,int);
drop function if exists public.staff_air_links(uuid,text,int,int);
create or replace function public.staff_air_links(
  p_nhansu_id uuid, p_search text default null, p_limit int default 20, p_offset int default 0)
 returns table(id uuid, link_air_koc text, id_kenh text, id_video text, ngay_air date, san_pham text, ten_brand text, status text, total bigint)
 language sql stable security definer set search_path to 'public' set statement_timeout to '20s'
as $function$
  with base as (
    select a.id, a.link_air_koc, a.id_kenh, a.id_video, a.ngay_air, a.san_pham,
      coalesce(b.ten_brand,'') as ten_brand,
      case when a.ngay_air is not null and a.ngay_air <= current_date then 'Đã On-air' else 'Chưa air' end as status
    from air_links a left join brands b on b.id = a.brand_id
    where a.nhansu_id = p_nhansu_id
      and (coalesce(p_search,'')=''
           or lower(coalesce(a.id_kenh,'')) like '%'||lower(p_search)||'%'
           or coalesce(a.id_video,'') like '%'||p_search||'%'
           or lower(coalesce(a.san_pham,'')) like '%'||lower(p_search)||'%'
           or lower(coalesce(b.ten_brand,'')) like '%'||lower(p_search)||'%'))
  select id, link_air_koc, id_kenh, id_video, ngay_air, san_pham, ten_brand, status, count(*) over() as total
  from base order by ngay_air desc nulls last limit greatest(p_limit,1) offset greatest(p_offset,0);
$function$;

-- Link air của 1 nhân sự (cho Báo cáo nhân sự) — join brand + trạng thái on-air. Lọc theo kỳ (ngày air).
create or replace function public.staff_air_links(p_nhansu_id uuid, p_from date default null, p_to date default null, p_limit int default 2000)
 returns table(id uuid, link_air_koc text, id_kenh text, id_video text, ngay_air date, san_pham text, ten_brand text, status text)
 language sql stable security definer set search_path to 'public' set statement_timeout to '20s'
as $function$
  select a.id, a.link_air_koc, a.id_kenh, a.id_video, a.ngay_air, a.san_pham,
    coalesce(b.ten_brand,'') as ten_brand,
    case when a.ngay_air is not null and a.ngay_air <= current_date then 'Đã On-air' else 'Chưa air' end as status
  from air_links a left join brands b on b.id = a.brand_id
  where a.nhansu_id = p_nhansu_id
    and (p_from is null or a.ngay_air >= p_from) and (p_to is null or a.ngay_air <= p_to)
  order by a.ngay_air desc nulls last limit p_limit;
$function$;

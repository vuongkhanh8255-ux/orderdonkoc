-- Thêm commission_actual (hoa hồng ĐÃ TRẢ = actual_paid_commission) vào koc_order_totals.
-- Dashboard Hiệu suất KOC hiện 2 ô: "Hoa hồng (sẽ trả)" = est_commission, "Hoa hồng đã trả" = actual_commission.
-- (TikTok dashboard hiện "ước tính gộp" cao hơn — field gộp đó TikTok KHÔNG đẩy về API nên không lấy được.)
-- Đã apply lên DB 2026-06-20.
drop function if exists public.koc_order_totals(text,date,date);
create function public.koc_order_totals(p_shop_id text, p_start date, p_end date)
returns table(creators bigint, orders bigint, gmv numeric, qty bigint, commission numeric, commission_actual numeric)
language sql stable set statement_timeout to '20s'
as $function$
  select count(distinct creator_username) as creators,
    count(distinct order_id) as orders,
    coalesce(sum(price_amount * quantity), 0) as gmv,
    coalesce(sum(quantity), 0) as qty,
    coalesce(sum(est_commission), 0) as commission,
    coalesce(sum(actual_commission), 0) as commission_actual
  from tiktok_affiliate_orders
  where (p_shop_id is null or shop_id = p_shop_id)
    and (p_start is null or order_date >= p_start)
    and (p_end is null or order_date <= p_end)
    and creator_username is not null and creator_username <> '';
$function$;
grant execute on function public.koc_order_totals(text,date,date) to anon, authenticated;

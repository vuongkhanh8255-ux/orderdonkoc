-- Cast GẦN NHẤT mỗi KOC, đối chiếu file Thanh toán KOC (koc_payments).
-- Dùng cho panel "Định danh KOC" (tab Hiệu suất KOC): KOC nào đã book cast →
--   thẻ tô CAM + ghi "🔥 Cast gần nhất: <số>đ · <ngày>".
-- Tách username từ channel_link (https://www.tiktok.com/@username). Chỉ tính cast_net > 0.
-- distinct on (uname) order by pay_date desc → lấy lần cast mới nhất của mỗi KOC.
-- SECURITY DEFINER: anon gọi được nhưng KHÔNG lộ PII (chỉ trả uname/cast/ngày/brand).
-- Đã apply lên DB 2026-06-19.
create or replace function public.koc_latest_cast()
returns table(uname text, last_cast numeric, last_date date, brand text)
language sql stable security definer
set search_path to 'public'
set statement_timeout to '15s'
as $function$
  select distinct on (uname) uname, cast_net as last_cast, pay_date as last_date, brand
  from (
    select lower((regexp_match(channel_link, '@([^/?#]+)'))[1]) as uname,
           cast_net, pay_date, brand
    from koc_payments
    where channel_link ~ '@' and cast_net is not null and cast_net > 0
  ) z
  where uname is not null and uname <> ''
  order by uname, last_date desc nulls last;
$function$;
grant execute on function public.koc_latest_cast() to anon, authenticated;

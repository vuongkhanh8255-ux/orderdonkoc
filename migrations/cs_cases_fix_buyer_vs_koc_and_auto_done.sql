-- 27/7/2026 — Feedback CS Module 2 (Trả hàng):
--  (1) Cột "Khách" đang hiện KOC: bản cũ set buyer_name = o.creator_username với đơn TikTok,
--      mà creator_username là KOC affiliate, KHÔNG phải người mua. Tách ra cột koc_username riêng.
--      TikTok affiliate report KHÔNG có thông tin người mua -> buyer_name để trống (không bịa).
--      Shopee: lấy recipient_name (tên người nhận THẬT) + phone + tỉnh; fallback buyer_username.
--  (2) Đơn TikTok fully_return='Yes' = sàn ĐÃ hoàn tiền xong, CS không phải thao tác
--      -> tạo case với status='done' luôn (CS khỏi bấm tay 689 đơn).
--  (3) product_category: CS tự phân loại SP (gợi ý tự động ở frontend, CS chọn tay thì đè).

alter table cs_cases add column if not exists koc_username text;
alter table cs_cases add column if not exists buyer_province text;
alter table cs_cases add column if not exists product_category text;

CREATE OR REPLACE FUNCTION public.cs_seed_return_cases(p_days integer DEFAULT 60)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int := 0; n2 int := 0;
begin
  -- SHOPEE: khách THẬT = recipient_name (fallback buyer_username)
  insert into cs_cases(case_type, platform, order_sn, shop_name, buyer_name, buyer_phone,
                       buyer_province, product_summary, status, source, order_key)
  select 'return','shopee', o.order_sn, o.shop_name,
    nullif(trim(coalesce(o.recipient_name, o.buyer_username, '')), ''),
    o.recipient_phone, o.recipient_province,
    left(coalesce(((o.items #>> '{}')::jsonb -> 0 ->> 'item_name'), ''), 200), 'new','auto','shopee|'||o.order_sn
  from shopee_orders o
  where o.order_status='TO_RETURN' and o.items is not null and jsonb_typeof(o.items)='string'
    and to_timestamp(o.create_time)::date >= current_date - p_days
  on conflict (order_key) do nothing;
  get diagnostics n = row_count;

  -- TIKTOK (affiliate): KHÔNG có tên khách -> buyer_name NULL, creator_username vào koc_username.
  -- fully_return='Yes' = sàn đã hoàn tiền xong -> vào thẳng 'done'.
  insert into cs_cases(case_type, platform, order_sn, shop_name, buyer_name, koc_username,
                       product_summary, status, source, order_key, done_at)
  select 'return','tiktok', o.order_id, m.seller_name, null, o.creator_username,
    left(coalesce(pc.name, o.product_id), 200), 'done','auto','tiktok|'||o.order_id, now()
  from tiktok_affiliate_orders o
  left join tiktok_product_cache pc on pc.product_id = o.product_id
  left join tiktok_affiliate_sync_meta m on m.shop_id = o.shop_id
  where o.fully_return='Yes' and o.order_date >= current_date - p_days
  on conflict (order_key) do nothing;
  get diagnostics n2 = row_count;
  return n + n2;
end $function$;

-- ── BACKFILL dữ liệu cũ ──
-- LƯU Ý: mỗi lệnh chạy RIÊNG. Nhiều CTE update cùng đụng 1 dòng trong 1 câu lệnh thì
-- chỉ cái ĐẦU ăn, cái sau bị bỏ qua âm thầm.

-- 1) TikTok: chuyển tên đang nằm sai ở cột Khách sang cột KOC (690 dòng)
update cs_cases set koc_username = coalesce(koc_username, buyer_name), buyer_name = null
where case_type='return' and platform='tiktok' and buyer_name is not null;

-- 2) TikTok đã hoàn tiền + CS CHƯA đụng -> Hoàn tất (689 dòng; đơn 'processing' giữ nguyên)
update cs_cases set status='done', done_at=coalesce(done_at, now()), updated_at=now()
where case_type='return' and platform='tiktok' and status='new'
  and reason_category is null and coalesce(note,'')='';

-- 3) Shopee: lấy tên người nhận THẬT + sđt + tỉnh (263 dòng)
update cs_cases c set
  buyer_name = coalesce(nullif(trim(o.recipient_name),''), c.buyer_name),
  buyer_phone = coalesce(c.buyer_phone, o.recipient_phone),
  buyer_province = coalesce(c.buyer_province, o.recipient_province)
from shopee_orders o
where c.case_type='return' and c.platform='shopee' and o.order_sn = c.order_sn;

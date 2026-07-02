-- CHỐT CHẶN ZOMBIE (2/7/2026): triệt tiêu tận gốc vụ "gỡ định danh xong tự sống lại".
-- Gốc: bản JS cũ trong cache trình duyệt (BookingPerformanceTab/KocIdentityOverview localStorage)
--   upsert NGƯỢC định danh đã xoá lên DB với assigned_at CŨ. Code frontend đã fix nhưng browser
--   cache cũ vẫn hồi sinh → cần trigger DB độc lập frontend.
-- Dấu hiệu zombie: INSERT định danh có assigned_at TRƯỚC lần 'remove' gần nhất của chính nó
--   (koc_id, brand_name). Gán MỚI thật (assigned_at = hôm nay, sau mọi remove) → KHÔNG bị chặn.
create or replace function public.block_zombie_assignment()
returns trigger language plpgsql as $function$
begin
  if exists (
    select 1 from koc_assignment_history h
    where h.koc_id = NEW.koc_id
      and h.brand_name = NEW.brand_name
      and h.action = 'remove'
      and h.created_at > NEW.assigned_at
  ) then
    return null;   -- bỏ qua insert (zombie chết lặng lẽ, không văng lỗi ra client)
  end if;
  return NEW;
end $function$;

drop trigger if exists trg_block_zombie_assignment on koc_brand_assignments;
create trigger trg_block_zombie_assignment
  before insert on koc_brand_assignments
  for each row execute function public.block_zombie_assignment();

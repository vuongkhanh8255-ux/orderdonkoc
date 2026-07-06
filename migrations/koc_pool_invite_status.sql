-- Module 8: trạng thái mời KOC (nhắn tin IM / target collab) — chỉ khanhpro8255 thao tác
alter table koc_marketplace_pool
  add column if not exists moi_im_at timestamptz,
  add column if not exists moi_collab_at timestamptz,
  add column if not exists moi_ghi_chu text;

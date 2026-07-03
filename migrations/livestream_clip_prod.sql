-- 3/7/2026 — "Xưởng Clip" (Phase 1): bảng sản xuất clip FAQ cho Module Live AI.
-- 1 hàng / 1 câu hỏi (intent). Lưu kịch bản + prompt ảnh + link ảnh/video trung gian + trạng thái.
-- Clip CUỐI (đường dẫn local OBS đọc) vẫn nằm ở livestream_intents.clip.
create table if not exists public.livestream_clip_prod (
  intent_id   text primary key,
  script      text default '',   -- kịch bản avatar đọc
  img_prompt  text default '',   -- prompt tạo ảnh nhân vật (copy sang Gemini/GPT)
  image_url   text default '',   -- link ảnh nhân vật đã gen (dán vào)
  video_url   text default '',   -- link video HeyGen (dán vào)
  status      text default 'todo', -- todo | lam | xong
  updated_at  timestamptz default now()
);
grant all on public.livestream_clip_prod to anon, authenticated;

-- Seed kịch bản + prompt ảnh mẫu cho 5 câu FAQ sẵn có (Khánh sửa lại theo sản phẩm thật).
insert into public.livestream_clip_prod (intent_id, script, img_prompt) values
 ('gia', 'Dạ giá sản phẩm bên em hôm nay đang ưu đãi cực tốt trong phiên live nha cả nhà! Mọi người bấm vào giỏ hàng màu cam góc dưới bên trái màn hình là thấy giá sốc liền, số lượng có hạn nên nhanh tay chốt đơn kẻo hết ạ!',
   'Người phụ nữ Việt 25 tuổi, da sáng, tóc đen dài, áo thun tối màu, tươi cười tư vấn trước phông hoa/studio sáng, tay cầm [ĐÍNH ẢNH SẢN PHẨM THẬT] hướng về camera. Chân thực như quay điện thoại, khung dọc 9:16, ánh sáng mềm.'),
 ('ship', 'Dạ bên em ship toàn quốc, đóng gói kỹ càng chắc chắn nha cả nhà. Đơn thường khoảng 2 đến 4 ngày là tới tay mình rồi, lại còn được áp mã freeship của Shopee nữa đó, cứ yên tâm chốt đơn ạ!',
   'Người phụ nữ Việt 25 tuổi, da sáng, tóc đen dài, áo thun tối màu, tươi cười tư vấn trước phông hoa/studio sáng, tay cầm [ĐÍNH ẢNH SẢN PHẨM THẬT] hướng về camera. Chân thực như quay điện thoại, khung dọc 9:16, ánh sáng mềm.'),
 ('size', 'Dạ hàng bên em còn đủ mẫu nha cả nhà ơi, nhưng phiên live số lượng có hạn nên bạn nào ưng thì chốt liền tay giúp em kẻo hết mẫu đẹp ạ. Cần tư vấn thêm cứ để lại bình luận em hỗ trợ ngay nha!',
   'Người phụ nữ Việt 25 tuổi, da sáng, tóc đen dài, áo thun tối màu, tươi cười tư vấn trước phông hoa/studio sáng, tay cầm [ĐÍNH ẢNH SẢN PHẨM THẬT] hướng về camera. Chân thực như quay điện thoại, khung dọc 9:16, ánh sáng mềm.'),
 ('voucher', 'Dạ phiên live hôm nay có nhiều voucher giảm giá lắm nha cả nhà! Mọi người nhớ bấm vào ô voucher hoặc mã giảm ngay trên màn hình để lưu về, áp vào lúc thanh toán là được giảm thêm liền đó, canh đúng khung giờ vàng nha ạ!',
   'Người phụ nữ Việt 25 tuổi, da sáng, tóc đen dài, áo thun tối màu, tươi cười tư vấn trước phông hoa/studio sáng, tay cầm [ĐÍNH ẢNH SẢN PHẨM THẬT] hướng về camera. Chân thực như quay điện thoại, khung dọc 9:16, ánh sáng mềm.'),
 ('chatlieu', 'Dạ sản phẩm bên em thành phần lành tính, chất lượng đảm bảo, cam kết chính hãng nha cả nhà. Nhà em có đầy đủ giấy tờ kiểm định rõ ràng, mọi người mua yên tâm sử dụng ạ. Cần biết thêm chi tiết cứ comment em tư vấn kỹ nha!',
   'Người phụ nữ Việt 25 tuổi, da sáng, tóc đen dài, áo thun tối màu, tươi cười tư vấn trước phông hoa/studio sáng, tay cầm [ĐÍNH ẢNH SẢN PHẨM THẬT] hướng về camera. Chân thực như quay điện thoại, khung dọc 9:16, ánh sáng mềm.')
on conflict (intent_id) do nothing;

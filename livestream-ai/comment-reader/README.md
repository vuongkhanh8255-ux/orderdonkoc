# Shopee Live Comment Reader — POC (Phase 0)

**Mục đích:** Đây là bài test **GO/NO-GO** của cả dự án Livestream AI. Nếu extension này bắt được comment phòng live Shopee ổn định → cả tool sống. Nếu gãy liên tục → phải xoay hướng (OCR, hoặc dùng BocaLive).

Extension **không hardcode selector** (Shopee đổi CSS là gãy). Nó tự dò vùng chat bằng cách theo dõi chỗ nào liên tục có comment mới được thêm vào. Có nút "dạy thủ công" làm dự phòng.

---

## Cách cài (Chrome / Edge / Cốc Cốc)

1. Mở `chrome://extensions` (Edge: `edge://extensions`).
2. Bật **Developer mode** (góc trên phải).
3. Bấm **Load unpacked** → chọn thư mục:
   `C:\Users\ASUS\koc-tool\livestream-ai\comment-reader`
4. Thấy extension "Shopee Live Comment Reader (POC)" xuất hiện → xong.

---

## Cách test (không cần shop 10k, không cần tự phát live)

Điểm hay: **đọc comment với tư cách người xem** — nên mở phòng live của **bất kỳ ai** đang có nhiều người comment là test được.

1. Vào `https://live.shopee.vn` → mở 1 phòng live **đang đông** (nhiều comment chạy).
2. Góc trên phải sẽ hiện panel cam **🟢 Shopee Comment Reader**.
3. Chờ ~10-15 giây. Nếu tự dò được, badge "vùng" chuyển thành **tự do ✓** và comment bắt đầu chảy vào panel + thống kê "Tốc độ/phút" tăng.
4. Nếu sau ~15s vẫn trống → bấm **🎯 Chọn vùng chat** rồi **click vào 1 comment bất kỳ** trên màn hình. Badge chuyển **thủ công ✓**, comment bắt đầu chảy.
5. Mở Console (F12) sẽ thấy log `[ShopeeCR] user: nội dung` cho từng comment.

---

## Tiêu chí đánh giá (điền vào rồi báo lại)

Chạy liên tục **15-30 phút** trên 1 phòng đông, rồi trả lời:

| Câu hỏi | Kết quả |
|---|---|
| Tự dò được vùng chat không, hay phải chọn thủ công? | |
| Bắt được ~bao nhiêu % comment (so mắt thường)? | |
| Có bị **sót** khi comment chạy nhanh không? | |
| Có bị **trùng/lặp** comment không? | |
| Chạy 30 phút có **gãy** (ngừng bắt) không? | |
| Tách được **tên người + nội dung** không, hay dính chung? | |

**Kết luận cần:** GO (bắt tốt, ít sót) hay NO-GO (gãy/sót nhiều)?

---

## Nếu kết quả tốt (GO) → bước tiếp theo

Extension đã có sẵn cầu nối WebSocket tới `ws://127.0.0.1:8787` (badge "agent"). Bước 2 sẽ là **Desktop Agent (Node)**:
- Nhận comment từ extension qua WebSocket này.
- Nhận diện câu hỏi tiếng Việt (keyword → embedding).
- Điều khiển OBS phát clip trả lời (obs-websocket v5).

## Nếu gãy/sót nhiều (NO-GO)

- Thử phương án chặn WebSocket của Shopee (nghe network) thay vì đọc DOM.
- Hoặc OCR vùng comment.
- Hoặc dừng tự build, dùng BocaLive ($58/tháng) — xem mục 8 file PLAN trên Desktop.

---

## Ghi chú kỹ thuật

- `manifest.json` — khai báo extension, chạy content script trên `*.shopee.vn`, `all_frames` (chat có thể nằm trong iframe).
- `content.js` — toàn bộ logic: tự dò vùng chat (chấm điểm theo tần suất node mới), bắt comment (MutationObserver), chống lặp (cửa sổ thời gian), overlay hiển thị, cầu WebSocket sang agent.
- Chưa gửi gì ra ngoài internet — chỉ đọc DOM local + (nếu có) gửi sang agent trên chính máy mình. An toàn cho POC.
- **Rủi ro ToS:** đây là đọc DOM trang của chính mình khi đã đăng nhập/xem — mức rủi ro thấp hơn tự chế request API, nhưng vẫn nên test bằng tài khoản phụ khi chạy thật.

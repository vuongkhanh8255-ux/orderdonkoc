# 🔴 ĐỌC FILE NÀY TRƯỚC — Hướng dẫn tiếp tục dự án Livestream AI

> File này để bàn giao: bất kỳ AI hoặc người nào đọc xong là hiểu dự án đang ở đâu và làm tiếp được ngay.
> Cập nhật lần cuối: 2026-07-03.

---

## 1. Dự án này là gì?

Tool tự động hoá **livestream bán hàng trên Shopee Live** cho **gian hàng của chính chủ** (KHÔNG bán ra ngoài).

**Cơ chế:** làm sẵn kho video FAQ (giá, ship, size, voucher...) → phát vòng lặp khi không ai hỏi (idle) → khi có người comment thì nhận diện câu hỏi và tự bật clip trả lời tương ứng → xong quay lại vòng lặp.

**Kế hoạch tổng thể đầy đủ:** file `PLAN_Livestream_AI_Shopee.md` trên Desktop máy chủ (`C:\Users\ASUS\Desktop\`). File đó có: nghiên cứu thị trường, luật Shopee, chi phí, so sánh tự-build vs mua BocaLive. **Nên đọc nó để nắm bối cảnh.**

---

## 2. Kiến trúc (đã chốt)

```
┌────────────────────┐   ws://127.0.0.1:8787   ┌──────────────┐   obs-websocket:4455   ┌─────┐   RTMP   ┌────────────┐
│ comment-reader     │ ──────────────────────> │    agent     │ ─────────────────────> │ OBS │ ──────>  │ Shopee Live│
│ (Chrome extension) │      comment JSON       │ (Node.js)    │   phát clip trả lời    │     │          │            │
└────────────────────┘                         └──────────────┘                        └─────┘          └────────────┘
   đọc DOM comment                          nhận diện câu hỏi tiếng Việt
   phòng live Shopee                        -> chọn clip phù hợp
```

- **Dashboard quản lý** (chưa làm) sẽ tích hợp thẳng vào app **koc-tool** (React + Supabase) dưới dạng 1 tab mới — KHÔNG tách app riêng (vì tự dùng, không cần cách ly dữ liệu).
- **Desktop Agent** tách riêng vì điều khiển OBS phải chạy cục bộ trên máy phát live.

---

## 3. Trạng thái hiện tại

| Phần | Trạng thái | Ghi chú |
|---|---|---|
| **Phase 0 — Đọc comment** (`comment-reader/`) | ⚠️ **NO-GO trên trang XEM web desktop** (3/7) | Test thật: Shopee Live web desktop **KHÔNG hiện khung comment** + **KHÔNG có WebSocket** (đã soi Network) → extension đọc DOM/WS không có gì để đọc. **Nhưng** đây là trang người-xem, chưa phải môi trường thật. **Đích thật = console live trong Seller Center (khi mình là HOST)** — chưa test được vì cần đang phát live. |
| **Bước 2 — Desktop Agent** (`agent/`) | ✅ Build + **đã verify bộ nhận diện** (3/7) | Test 16 câu comment thật: nhận đúng giá/ship/size/voucher/chất liệu (cả viết tắt), im lặng đúng lúc với câu khen. Chưa test với OBS thật (chưa cài OBS). |
| **Bước 3 — Tab dashboard trong koc-tool** | ✅ **XONG (3/7)** | Tab **"Module 4: Live AI"** (menu Shopee). CRUD kho câu hỏi→clip trên Supabase (bảng `livestream_intents` + `livestream_config`), test nhận diện ngay trên web, xuất `faq.json` cho agent. File: `src/components/LivestreamAiTab.jsx`. |
| Bước 4 — Xưởng làm video AI | ⏳ Chưa làm | LLM script → TTS → HeyGen avatar → FFmpeg |

### 🔑 CHỐT go/no-go Phase 0 (3/7): trang XEM live web desktop = NO-GO cho đọc comment.
Không hiện comment + không WebSocket. Hướng đi tiếp cho phần đọc comment:
1. **Test lại ở đúng môi trường HOST** — console livestream trong Seller Center (khi shop mình đang phát) HIỆN comment. Cần verify shop đủ điều kiện đẩy OBS/RTMP (điều kiện follower) rồi test extension ở console đó.
2. Nếu console cũng khó đọc → nghe WebSocket/API của Seller Center, hoặc OCR, hoặc BocaLive.

### 🔗 Bước 3 — nối agent ĐỌC TỪ SUPABASE: ✅ XONG (3/7).
Agent giờ **tự fetch `livestream_intents` + `livestream_config` từ Supabase REST** (ưu tiên Supabase, fallback faq.json → faq.example.json). Anon key tự đọc từ `.env` gốc koc-tool (không commit key). File: `agent/src/faqSource.js` + `index.js`. **Đã test `npm run mock -- --dry`:** log `[Config] Nguon: Supabase — 5 intent` + nhận diện đúng. ⇒ Sửa câu hỏi trên web dashboard → agent tự lấy, khỏi xuất file tay (nút Xuất faq.json vẫn giữ để chạy offline).

### ⏭️ CÒN LẠI (theo thứ tự):
1. **Đọc comment ở console HOST thật** (Seller Center khi đang live) — go/no-go còn lại. Cần shop đủ điều kiện + đang phát.
2. **Test OBS thật:** cài OBS → 2 scene IDLE/ANSWER + media source `ANSWER_PLAYER` + clip mp4 → sửa `config.json` (password OBS) → `npm start`. (Bộ não + nạp config đã chạy; chỉ còn nối OBS.)
3. **Bước 4 — xưởng video AI.**

### ⭐ VIỆC QUAN TRỌNG NHẤT ĐANG DANG DỞ (go/no-go của cả dự án):

**Test extension `comment-reader` có đọc được comment phòng live Shopee thật không.**
- Đã cài extension thành công (panel cam hiện góc phải).
- Đang kẹt ở: cần mở **1 phòng live Shopee đang phát + có comment chạy** để xem panel có tự bắt được comment không.
- **Cách test:** vào `shopee.vn` → đăng nhập → tìm mục Shopee Live → mở 1 phiên đang LIVE đông người → nhìn panel cam góc phải: comment có chảy vào không? Nếu sau ~15s không tự bắt → bấm "🎯 Chọn vùng chat" rồi click vào 1 comment.
- **Kết quả cần:** GO (bắt được, ít sót, chạy 30 phút không gãy) hay NO-GO (gãy/sót nhiều)?
- Chi tiết tiêu chí: xem `comment-reader/README.md`.

**Nếu GO** → làm Bước 3 (dashboard). **Nếu NO-GO** → xoay hướng: nghe WebSocket của Shopee, hoặc OCR, hoặc dùng BocaLive ($58/tháng).

---

## 4. Cách chạy & test từng phần

### Desktop Agent (`agent/`)
```bash
cd livestream-ai/agent
npm install
npm run mock -- --dry      # test logic nhận diện, KHÔNG cần OBS/Shopee
```
Rồi gõ câu hỏi ("gia bao nhieu", "ship bao lau"...) xem nhận diện đúng không.

Test với OBS thật: xem `agent/README.md` (setup 2 scene IDLE/ANSWER, sửa `config.json`, tạo `faq.json`).

### Comment Reader (`comment-reader/`)
Load unpacked vào `chrome://extensions` (bật Developer mode). Chi tiết: `comment-reader/README.md`.

---

## 5. Bản đồ file

```
livestream-ai/
├── TIEP-TUC.md              ← file này
├── README.md                ← tổng quan module
├── comment-reader/          ← Phase 0: Chrome extension đọc comment
│   ├── manifest.json
│   ├── content.js           ← logic tự dò vùng chat + bắt comment
│   └── README.md            ← hướng dẫn cài + test go/no-go
└── agent/                   ← Bước 2: Desktop Agent (Node)
    ├── src/
    │   ├── index.js         ← điểm vào, cờ --mock/--dry
    │   ├── intent.js        ← nhận diện câu hỏi tiếng Việt (keyword)
    │   ├── obs.js           ← điều khiển OBS (obs-websocket v5)
    │   ├── orchestrator.js  ← máy trạng thái: cooldown/queue/khóa
    │   └── commentSource.js ← WebSocket server + nguồn mock
    ├── config.json          ← cấu hình OBS + port + cooldown
    ├── faq.example.json     ← mẫu map câu hỏi → clip
    └── README.md
```

---

## 6. Ràng buộc & lưu ý quan trọng

1. **Điều kiện đẩy OBS lên Shopee:** gian hàng cần **~10.000 follower** mới bật được stream OBS/RTMP từ máy tính (con số cần verify cho Shopee VN). **Phải kiểm tra gian hàng đủ điều kiện chưa** — nếu chưa thì tool xong cũng không đẩy live thật được.
2. **Luật Shopee:** CHO PHÉP livestream AI nhưng phải **xin duyệt trước + gắn nhãn "AI-generated"**. Đi đường hợp lệ. (Khác TikTok Shop — cấm thẳng AI voice/host, nên bản này CHỈ làm cho Shopee.)
3. **Đọc comment là phần mong manh nhất:** Shopee VN không có API comment chính thức → phải đọc DOM, Shopee đổi giao diện là có thể gãy. Nên test bằng **tài khoản phụ**, chấp nhận bảo trì.
4. **Làm video AI (Bước 4):** combo khuyến nghị = Gemini/Claude viết script → Vbee hoặc FPT.AI (giọng Việt, đừng dùng ElevenLabs) → HeyGen chế độ audio-driven → FFmpeg tạo biến thể. ~53-99 USD dựng kho 20-50 clip (làm 1 lần, tái dùng nhiều tháng).

---

## 7. Bước tiếp theo đề xuất (theo thứ tự)

1. **Hoàn tất go/no-go Phase 0** (mục 3) — đây là việc gấp nhất.
2. Kiểm tra điều kiện OBS/RTMP trên gian hàng Shopee thật.
3. Nếu Phase 0 GO: làm **Bước 3 — tab dashboard trong koc-tool** để quản lý kho clip + map câu hỏi bằng UI (thay cho sửa `faq.json` tay), lưu config lên Supabase để agent đọc.
4. Nâng nhận diện lên **tầng 2 (embedding)** cho câu diễn đạt lạ.
5. **Bước 4 — xưởng làm video AI** trong dashboard.

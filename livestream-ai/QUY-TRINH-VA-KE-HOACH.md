# 🎥 LIVE AI — Quy trình & Kế hoạch tổng thể

> Tool tự động hoá **livestream bán hàng trên Shopee Live** cho **gian hàng của chính mình**.
> Bản 2.0 — cập nhật **3/7/2026** (đã qua 1 vòng thẩm định: fact-check với code + review góc người vận hành).
> File này gom toàn bộ: đang ở đâu, chạy được gì, còn thiếu gì, ngày live bật thế nào, lỗi thì tra ở đâu.

---

## 1. Ý tưởng 1 câu

Làm sẵn **kho video FAQ** (trả lời giá / ship / size / voucher…) → khi livestream, **phát vòng lặp** lúc không ai hỏi → **có người comment thì tự nhận diện câu hỏi và bật đúng clip trả lời** → xong quay lại vòng lặp. Người xem tưởng có host tư vấn thật.

---

## 2. Sơ đồ tổng thể

```
   NGƯỜI XEM comment trong phòng live Shopee
                    │  (nửa "VÀO" — ĐANG GIẢI)
                    ▼
   [Đọc comment]  ──ws──►  AGENT (máy tính)  ──obs-websocket──►  OBS  ──RTMP──►  Shopee Live
                          nhận diện câu hỏi VN          phát clip trả lời
                                    ▲
                                    │ đọc kho câu hỏi + clip
                          ┌─────────┴──────────┐
                          │  koc-tool (web)     │  ← mình quản mọi thứ ở đây
                          │  + Supabase (data)  │
                          └────────────────────┘
```

Hệ thống có **2 nửa**:
- **Nửa "TRẢ LỜI"** (hiểu câu hỏi → phát clip qua OBS) → ✅ **XONG, chạy thật**.
- **Nửa "VÀO"** (tự đọc comment người xem) → 🔴 **chưa xong** (Shopee không cho đọc dễ — xem kế hoạch B ở mục 6).

---

## 3. Các thành phần đã dựng (trong app koc-tool + agent)

| # | Thành phần | Ở đâu | Trạng thái |
|---|---|---|---|
| 1 | **Module 4: Live AI** — kho câu hỏi → clip (thêm/sửa, test nhận diện, xuất faq.json) | Tab web (menu Shopee) | ✅ Xong |
| 2 | **Agent** — nhận diện câu hỏi tiếng Việt + điều khiển OBS | `livestream-ai/agent/` (chạy trên máy phát live) | ✅ Xong + chạy thật với OBS |
| 3 | **Đọc config từ Supabase** — sửa trên web, agent tự lấy | agent | ✅ Xong |
| 4 | **Module 5: Xưởng Clip** — dây chuyền sản xuất clip (kịch bản → ảnh → video → clip cuối) | Tab web | ✅ Làm tay xong · 🟡 Tự động chờ key |
| 5 | **Live AI Studio** — giao diện điều khiển pro (như mockup) | Tab web | ✅ Miếng 1 (giao diện + playlist/script thật) |
| 6 | **Comment reader** — extension Chrome đọc comment | `livestream-ai/comment-reader/` | ⚠️ Web-xem NO-GO, chờ test console host |

---

## 4. Quy trình sản xuất clip (Xưởng Clip)

### 4a. Clip TRẢ LỜI — mỗi câu hỏi đi qua 4 bước

```
① Kịch bản  →  ② Ảnh nhân vật cầm SP  →  ③ Video avatar nói  →  ④ Clip cuối (máy phát live)
  (viết/AI)      (ChatGPT/OpenAI gen)      (HeyGen ảnh→nói)       (tải về, điền đường dẫn)
```

- **① Kịch bản:** viết tay hoặc AI. Đã seed sẵn 5 kịch bản mẫu.
- **② Ảnh:** dùng **OpenAI gpt-image-1** (ChatGPT) — tạo người ảo cầm sản phẩm. Có nút **🪄 Tạo ảnh tự động**.
- **③ Video:** dùng **HeyGen** — đưa ảnh + kịch bản → người ảo nói giọng Việt, nhép miệng. Có nút **🎬 Tạo video tự động** + **🔄 Kiểm tra**.
- **④ Clip cuối — làm đúng 3 bước con này** (dễ điền nhầm chỗ):
  1. Ở **Module 5**: video xong → bấm **▶ Xem/tải video** → tải file mp4, lưu vào thư mục cố định trên **máy phát live**, VD `C:/live-clips/gia.mp4`.
  2. Mở **Module 4: Live AI** → tìm đúng câu hỏi đó → sửa ô **clip** = `C:/live-clips/gia.mp4` → Lưu.
  3. Agent tự đọc từ Supabase — **không cần** xuất faq.json lại.

> ⚠️ **Link video HeyGen HẾT HẠN sau ~7 ngày.** Render xong phải **tải mp4 về máy NGAY trong tuần**. Nếu link chết: bấm 🔄 Kiểm tra lại để lấy link mới; link mới cũng chết thì phải render lại (tốn phí).

### 4b. Clip IDLE (vòng lặp — thứ người xem nhìn nhiều nhất)

Ngoài clip trả lời, cần **video phát vòng lặp khi không ai hỏi** (giới thiệu sản phẩm, ưu đãi…):
- Làm bằng: quay giới thiệu sản phẩm thật, hoặc cũng gen bằng HeyGen (kịch bản dài hơn, 2-5 phút).
- Đặt vào OBS: scene **IDLE** → Add **Media Source** → chọn file → **tick Loop** (khác ANSWER_PLAYER là KHÔNG loop).
- Nên có 2-3 clip idle xoay vòng cho đỡ nhàm.

**Chọn công cụ (đã chốt):** ảnh = **OpenAI (ChatGPT)**, video = **HeyGen** (đi đường **API Pay-As-You-Go**, KHÔNG mua gói web $29). Điều khiển build thẳng vào koc-tool, **KHÔNG dùng n8n** (n8n không giảm phí API).

---

## 5. Trạng thái chi tiết: XONG / CHỜ / CHƯA

### ✅ ĐÃ XONG + chạy thật (test tận mắt)
- Kho câu hỏi (Module 4) + nhận diện tiếng Việt (test 16 câu đúng).
- Agent đọc config từ Supabase (khỏi sửa file tay).
- **Agent → OBS phát clip** (đã thấy clip chạy trong OBS).
- Xưởng Clip làm tay + giao diện Studio pro.

### 🟡 CODE XONG — chờ Khánh kích hoạt, CHƯA chạy thật lần nào
- **Xưởng Clip tự động (OpenAI + HeyGen):** code viết xong, **đã review tĩnh khớp spec 100%**, nhưng **chưa từng gọi API thật** (chưa có key). Lần chạy đầu **có thể lòi lỗi** — cứ chụp màn hình lỗi gửi lại, giờ lỗi hiện rõ nguyên nhân thật (đã vá parse an toàn).
- Cần: cắm **2 API key vào Vercel** + nạp ví + Verify OpenAI org (mục 7).

### 🔴 CHƯA làm / phần khó
- **Đọc comment thật** (nửa "VÀO") — web-xem NO-GO; đích thật = **console live Seller Center khi mình là host** (cần đang phát live để test). Có kế hoạch B (mục 6).
- Nút "Điều khiển nhanh" ở Studio bấm thật (cần agent 2 chiều).
- Preview OBS trong web (khó — bắt luồng OBS).
- Thống kê Shopee realtime (cần data live).

---

## 6. Kế hoạch làm tiếp (kèm TIÊU CHÍ ĐẠT từng bước)

**Bước 0 — Kiểm điều kiện live OBS (làm TRƯỚC, không tốn gì):**
Vào Seller Center → mục Livestream → xem có lựa chọn **stream key / RTMP / đẩy luồng từ máy tính** không.
→ *Đạt khi:* xác nhận được shop **bật được OBS/RTMP** (nghi cần ~10k follower). Nếu chưa đủ điều kiện → đây là điểm chặn, phải nuôi follower/xin Shopee trước, các bước sau vô nghĩa với live thật.
Kèm theo: tìm hiểu + nộp **xin duyệt livestream AI** với Shopee, cách gắn nhãn "AI-generated".

**Bước 1 — Cắm key + test Xưởng Clip tự động** *(Khánh đang lo key)*
→ *Đạt khi:* gen thành công 1 clip từ A→Z (ảnh → video → tải về), sau đó ra **kho ~15-20 clip FAQ + 2-3 clip idle** đã tải về máy live, điền đường dẫn vào Module 4, agent `--mock` phát được từng clip trong OBS.

**Bước 2 — Test đọc comment ở console host (go/no-go còn lại)**
Cần 1 phiên live thật (nhờ điện thoại comment vào). Mở console live Seller Center + extension, xem có bắt được comment không.
→ *GO khi:* console hiện comment + extension bắt ≥90%, chạy 30 phút không gãy.
→ *NO-GO thì KẾ HOẠCH B theo thứ tự:* (1) nghe WebSocket/API của trang Seller Center, (2) OCR đọc chữ trên màn hình, (3) mua **BocaLive ~$58/tháng** (đắt nhưng chắc chắn chạy — tool thương mại làm sẵn đúng việc này).

**Bước 3 — Agent 2 chiều** → nút điều khiển ở Studio bấm được thật + agent báo trạng thái về web.
→ *Đạt khi:* bấm "Clip kế" trên web → OBS đổi clip trong <2s.

**Bước 4 — Phase B (để sau):** Preview OBS trong web + thống kê Shopee realtime.

**✅ TIÊU CHÍ XONG CẢ DỰ ÁN:** chạy **1 buổi live thử ≥30 phút** trên shop thật: clip idle tự loop, người xem comment hỏi → clip trả lời tự bật đúng, không cần ai ngồi gõ tay, không gãy giữa chừng.

---

## 7. Cách KÍCH HOẠT phần tự động (Khánh làm)

1. **Lấy 2 API key:**
   - OpenAI: platform.openai.com → API keys → tạo key + **Billing nạp ~$5-10** + **Verify Organization** (Settings → Organization — bắt buộc mới xài được gpt-image-1).
   - HeyGen: Settings → API → tạo key + **nạp ví** (Pay-As-You-Go — xem mục 8 về số tiền).
2. **Cắm vào Vercel:** vercel.com → project **orderdonkoc** → Settings → Environment Variables → thêm `OPENAI_API_KEY` và `HEYGEN_API_KEY` (chọn cả 3 môi trường) → Save.
3. **Redeploy** (Deployments → Redeploy bản mới nhất).
4. Xong → vào **Module 5: Xưởng Clip** bấm 🪄 Tạo ảnh → 🎬 Tạo video → 🔄 Kiểm tra.
5. **Nếu lỗi:** thông báo lỗi giờ hiện nguyên nhân thật (VD "OpenAI HTTP 401", "HeyGen upload lỗi 413") — chụp màn hình gửi Claude xử. **Ví cạn** thường hiện lỗi dạng "insufficient credit / quota / payment" ở nút 🎬 hoặc 🔄 → nạp thêm.

> ⚠️ 2 key này Khánh tự dán vào Vercel, Claude KHÔNG cầm key thô — an toàn.

---

## 8. Chi phí (thật thà: phần HeyGen chưa đo)

| Khoản | Giá | Độ chắc |
|---|---|---|
| OpenAI tạo ảnh | ~$0.2–0.35/ảnh (chất lượng cao) · ~$0.01–0.02 (nháp) | ✅ đã verify bảng giá |
| HeyGen tạo video (PAYG) | **CHƯA ĐO** — sẽ chốt sau clip đầu tiên. Dự trù nạp **$10-20** trước | ⚠️ đo thật rồi cập nhật |
| Cả kho ~20 clip FAQ | Ước **$10–30** theo đường PAYG. (Plan gốc từng ước 53-99 USD nhưng đó là đường mua gói + combo tool khác — mình đi PAYG rẻ hơn) | ⚠️ chốt sau bước 1 |
| Vercel + Supabase | 0đ (đã có sẵn) | ✅ |

**Nguyên tắc:** gen thử 1 clip đầu → xem HeyGen trừ bao nhiêu → nhân lên cho cả kho rồi mới nạp đủ. Đừng nạp nhiều ngay từ đầu.

---

## 9. RUNBOOK — ngày live bật thế nào (checklist)

> ⚠️ Lệnh chạy thật là **`npm start`** — KHÔNG phải `--mock` (mock = chế độ test gõ tay).

1. **Mở OBS** → kiểm: có 2 scene `IDLE` / `ANSWER`, scene IDLE có clip vòng lặp đang chạy, Tools → WebSocket Server Settings đang **bật** (port 4455, tắt auth).
2. **Chạy agent:** mở terminal → `cd "C:\APP CODE\koc-tool\livestream-ai\agent"` → **`npm start`** → chờ thấy 2 dòng: `[Config] Nguon: Supabase — N intent` và `[OBS] Da ket noi`.
3. **Bật nguồn comment** (khi nửa "VÀO" xong): mở console live + extension, badge "agent: da noi agent".
4. **Bắt đầu live trong Seller Center** (đẩy RTMP từ OBS: Settings → Stream → dán server + stream key của Shopee → Start Streaming).
5. Trong buổi: ngó panel/terminal thi thoảng; clip trả lời phát xong tự về IDLE.
6. **Kết thúc:** dừng live trong Seller Center → OBS Stop Streaming → terminal Ctrl+C tắt agent.

---

## 10. XỬ LÝ SỰ CỐ (tra nhanh)

| Hiện tượng | Nguyên nhân hay gặp | Cách sửa |
|---|---|---|
| OBS chuyển scene ANSWER nhưng **khung ĐEN** | Đường dẫn clip sai / file không tồn tại trên máy đó | Kiểm ô clip ở Module 4 đúng đường dẫn thật (VD `C:/live-clips/gia.mp4`), file có thật. (Code đã tự set `is_local_file` — không phải tick tay nữa) |
| Agent báo **không nối được OBS** | OBS chưa mở / WebSocket chưa bật / port-password lệch | Mở OBS trước → Tools → WebSocket Server Settings: bật, port 4455, tắt auth (password trong `agent/config.json` để rỗng) |
| Agent log `Nguon: faq.json` thay vì Supabase | Mất mạng, hoặc máy đó thiếu file `.env` gốc koc-tool | Kiểm mạng; máy mới thì chạy skill setup-may-moi gắn `.env` |
| Clip phát xong **không quay về IDLE** | Sự kiện kết thúc media không bắn (hiếm) | Ctrl+C chạy lại agent; kiểm source tên đúng `ANSWER_PLAYER` |
| Nút 🎬/🔄 báo lỗi "insufficient/quota/payment" | Ví OpenAI/HeyGen cạn | Nạp thêm ví bên tương ứng |
| 🎬 báo "Không tải được ảnh nhân vật (HTTP 4xx)" | Bucket `live-assets` không public / link ảnh chết | Kiểm bucket Supabase Storage `live-assets` đang Public |
| Xuất hiện lỗi lạ khác | — | Chụp màn hình lỗi (giờ hiện nguyên nhân thật) gửi Claude |

---

## 11. Ràng buộc quan trọng (phải nhớ)

1. **Điều kiện đẩy OBS lên Shopee:** nghi cần **~10.000 follower** mới bật stream OBS/RTMP → **Bước 0 của kế hoạch là verify cái này**. Chưa đủ thì tool xong cũng không đẩy live thật được.
2. **Luật Shopee:** CHO PHÉP livestream AI nhưng phải **xin duyệt + gắn nhãn "AI-generated"**. (TikTok thì CẤM → bản này CHỈ làm cho Shopee.)
3. **Link video HeyGen hết hạn ~7 ngày** → tải mp4 về máy ngay sau khi render (mục 4a bước ④).
4. **Đọc comment là phần mong manh nhất:** không có API chính thức → đọc DOM/WebSocket, dễ gãy khi Shopee đổi giao diện. Test bằng **tài khoản phụ**.
5. **DeepSeek KHÔNG tạo ảnh** (chỉ chữ) — ảnh phải OpenAI/Gemini.
6. (Tối ưu sau) Mỗi lần 🎬 là upload ảnh thành talking-photo MỚI bên HeyGen — sau này nên tái dùng `talking_photo_id` cũ khi gen lại cùng nhân vật cho đỡ rác/quota.

---

## 12. Kỹ thuật (cho AI/dev đọc — Khánh bỏ qua được)

**Bảng Supabase:**
- `livestream_intents` (id, label, keywords[jsonb], clip, enabled, sort_order) — kho câu hỏi→clip. **Cột `clip` = đường dẫn file agent phát.**
- `livestream_config` (cooldown_sec, min_confidence, max_queue) — logic agent.
- `livestream_clip_prod` (intent_id, script, img_prompt, image_url, video_url, video_id, voice_id, status) — sản xuất clip (Module 5).
- Storage bucket `live-assets` (**public**) — ảnh gen.

**File chính:**
- Web: `src/components/LivestreamAiTab.jsx` (M4), `LiveClipFactoryTab.jsx` (M5), `LiveStudioTab.jsx` (Studio).
- Backend tự động: `lib/liveai.js` (ngoài api/ để né trần 12 function Vercel Hobby) + 4 route `live_gen_image / live_make_video / live_check_video / live_voices` trong `api/tiktok-shop/analytics.js`.
- Agent: `livestream-ai/agent/src/{index,intent,orchestrator,obs,commentSource,faqSource}.js` + `config.json` (OBS url/password + bridge port + Supabase override + logic fallback).
- Extension: `livestream-ai/comment-reader/` (`manifest.json` + `content.js`).

**API tự động (spec đã verify qua workflow):**
- OpenAI ảnh: `POST api.openai.com/v1/images/generations` (gpt-image-1, trả `b64_json`, không có url) · `/v1/images/edits` (multipart `image[]`, ghép sản phẩm thật, `input_fidelity=high`).
- HeyGen (auth header `X-Api-Key`): upload `POST upload.heygen.com/v1/talking_photo` (raw bytes) → `data.talking_photo_id`; tạo `POST api.heygen.com/v2/video/generate` (dimension 720x1280 dọc) → `data.video_id`; poll `GET api.heygen.com/v1/video_status.get?video_id=` → `data.video_url` (signed, hết hạn ~7 ngày); giọng `GET /v2/voices` lọc `language==='Vietnamese'`.

**OBS agent:** 2 scene `IDLE`/`ANSWER` + media source `ANSWER_PLAYER` (không Loop); WebSocket bật (tắt auth); `is_local_file:true` bắt buộc khi SetInputSettings để phát file local (không thì khung đen).

**Chạy agent:** thật = `npm start` · test logic = `npm run mock -- --dry` (không cần OBS) · test với OBS = `node src/index.js --mock`. Agent đọc `.env` gốc koc-tool (`../../.env`) lấy Supabase URL+anon key; không có thì fallback `faq.json`.

---

*File bàn giao ngắn cho AI/máy khác: `TIEP-TUC.md`. Plan gốc: `PLAN_Livestream_AI_Shopee.md` (Desktop máy chủ).*
